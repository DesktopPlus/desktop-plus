import { Branch, BranchType } from '../../models/branch'
import { BranchSortOrder } from '../../models/branch-sort-order'
import { WorktreeEntry } from '../../models/worktree'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'

export type BranchGroupIdentifier = 'default' | 'recent' | 'other'

export interface IBranchListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly branch: Branch
  /** The worktree where this branch is currently checked out, if any */
  readonly worktreeInUse: WorktreeEntry | null
}

/**
 * Whether a branch is local-only, i.e. a local branch that has either never
 * been published to a remote or whose upstream has since been deleted.
 */
export function isLocalOnlyBranch(branch: Branch): boolean {
  return branch.type === BranchType.Local && (!branch.upstream || branch.isGone)
}

/**
 * Finds the worktree where a given branch is currently checked out.
 * Returns null if the branch is not checked out in any worktree.
 */
export function findWorktreeForBranch(
  branchName: string,
  worktrees: ReadonlyArray<WorktreeEntry>
): WorktreeEntry | null {
  for (const worktree of worktrees) {
    if (worktree.branch === null) {
      continue
    }
    // Extract branch name from refs/heads/branch-name format
    const wtBranchName = worktree.branch.replace(/^refs\/heads\//, '')
    if (wtBranchName === branchName) {
      return worktree
    }
  }
  return null
}

export function groupBranches(
  defaultBranch: Branch | null,
  allBranches: ReadonlyArray<Branch>,
  recentBranches: ReadonlyArray<Branch>,
  allWorktrees: ReadonlyArray<WorktreeEntry>,
  sortOrder: BranchSortOrder
): ReadonlyArray<IFilterListGroup<IBranchListItem>> {
  const groups = new Array<IFilterListGroup<IBranchListItem>>()

  if (defaultBranch) {
    const worktreeInUse = findWorktreeForBranch(
      defaultBranch.name,
      allWorktrees
    )
    groups.push({
      identifier: 'default',
      items: [
        {
          text: [defaultBranch.name],
          id: defaultBranch.name,
          branch: defaultBranch,
          worktreeInUse,
        },
      ],
    })
  }

  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  const recentBranchesWithoutDefault = recentBranches.filter(
    b => b.name !== defaultBranchName
  )
  if (recentBranchesWithoutDefault.length > 0) {
    const recentBranches = new Array<IBranchListItem>()

    for (const branch of recentBranchesWithoutDefault) {
      const worktreeInUse = findWorktreeForBranch(branch.name, allWorktrees)
      recentBranches.push({
        text: [branch.name],
        id: branch.name,
        branch,
        worktreeInUse,
      })
      recentBranchNames.add(branch.name)
    }

    groups.push({
      identifier: 'recent',
      items: recentBranches,
    })
  }

  const remainingBranches = allBranches.filter(
    b =>
      b.name !== defaultBranchName &&
      !recentBranchNames.has(b.name) &&
      !b.isDesktopForkRemoteBranch
  )
  const branchComparer = getBranchComparer(sortOrder)
  const sortedRemainingBranches = remainingBranches.sort((a, b) =>
    // Local branches are always sorted above remote branches, regardless of the sort order
    a.type === b.type ? branchComparer(a, b) : a.type - b.type
  )

  const remainingItems = sortedRemainingBranches.map(b => {
    const worktreeInUse = findWorktreeForBranch(b.name, allWorktrees)
    return {
      text: [b.name],
      id: b.name,
      branch: b,
      worktreeInUse,
    }
  })
  groups.push({
    identifier: 'other',
    items: remainingItems,
  })

  return groups
}

function getBranchComparer(
  sortOrder: BranchSortOrder
): (a: Branch, b: Branch) => number {
  switch (sortOrder) {
    case BranchSortOrder.Alphabetical:
      return (a, b) => a.name.localeCompare(b.name)
    case BranchSortOrder.LastModified:
      return (a, b) => b.tip.author.date.getTime() - a.tip.author.date.getTime()
  }
}
