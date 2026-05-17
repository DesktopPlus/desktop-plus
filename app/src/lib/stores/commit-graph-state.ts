import { Branch, BranchType } from '../../models/branch'
import { Repository } from '../../models/repository'
import type { IRepositoryState } from '../app-state'
import { getStringArray, setStringArray } from '../local-storage'

const commitGraph_HiddenBranchRefsKeyPrefix = 'commitGraph-hidden-branch-refs'
const commitGraph_CollapsedBranchGroupsKeyPrefix =
  'commitGraph-collapsed-branch-groups'
const commitGraph_ViewModeKey = 'commitGraph-view-mode'
const commitGraph_DefaultCollapsedBranchGroups = ['origin', 'upstream', 'tags']
const commitGraph_DefaultViewMode: CommitGraphViewModePreference = 'tree'

export const commitGraph_DefaultBranchListWidth = 180
export const commitGraph_BranchListWidthConfigKey =
  'commitGraph-branch-list-width'

export type CommitGraphViewModePreference = 'list' | 'tree'

export function commitGraph_getStoredViewMode(): CommitGraphViewModePreference {
  const value = localStorage.getItem(commitGraph_ViewModeKey)

  return value === 'list' || value === 'tree'
    ? value
    : commitGraph_DefaultViewMode
}

export function commitGraph_setStoredViewMode(
  viewMode: CommitGraphViewModePreference
) {
  localStorage.setItem(commitGraph_ViewModeKey, viewMode)
}

export function commitGraph_getStoredHiddenBranchRefs(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  currentBranch: Branch | null,
  defaultBranch: Branch | null,
  tags: Map<string, string> | null
): ReadonlyArray<string> | null {
  if (branches.length === 0 || tags === null) {
    return null
  }

  const key = commitGraph_GetHiddenBranchRefsKey(repository)

  return localStorage.getItem(key) !== null
    ? getStringArray(key)
    : commitGraph_GetInitialHiddenBranchRefs(
        branches,
        currentBranch,
        defaultBranch,
        tags
      )
}

export function commitGraph_setStoredHiddenBranchRefs(
  repository: Repository,
  hiddenBranchRefs: ReadonlyArray<string>
) {
  setStringArray(
    commitGraph_GetHiddenBranchRefsKey(repository),
    hiddenBranchRefs
  )
}

export function commitGraph_getStoredCollapsedBranchGroups(
  repository: Repository
): ReadonlyArray<string> {
  const key = commitGraph_GetCollapsedBranchGroupsKey(repository)

  return localStorage.getItem(key) === null
    ? commitGraph_DefaultCollapsedBranchGroups
    : getStringArray(key)
}

export function commitGraph_setStoredCollapsedBranchGroups(
  repository: Repository,
  collapsedBranchGroups: ReadonlyArray<string>
) {
  setStringArray(
    commitGraph_GetCollapsedBranchGroupsKey(repository),
    collapsedBranchGroups
  )
}

export function commitGraph_getCommitSelectionCandidates(
  state: IRepositoryState
): ReadonlyArray<string> {
  const { allHistoryCommitSHAs, commitGraphCommitSHAs, commitGraphRefs } =
    state.compareState

  if (commitGraphCommitSHAs.length === 0) {
    if (commitGraphRefs.length > 0 && state.commitSelection.shas.length > 0) {
      return [...allHistoryCommitSHAs, ...state.commitSelection.shas]
    }

    return allHistoryCommitSHAs
  }

  return Array.from(
    new Set([...allHistoryCommitSHAs, ...commitGraphCommitSHAs])
  )
}

function commitGraph_GetHiddenBranchRefsKey(repository: Repository) {
  return `${commitGraph_HiddenBranchRefsKeyPrefix}-${repository.hash}`
}

function commitGraph_GetCollapsedBranchGroupsKey(repository: Repository) {
  return `${commitGraph_CollapsedBranchGroupsKeyPrefix}-${repository.hash}`
}

function commitGraph_GetTagRef(tagName: string) {
  return `refs/tags/${tagName}`
}

function commitGraph_GetInitialHiddenBranchRefs(
  branches: ReadonlyArray<Branch>,
  currentBranch: Branch | null,
  defaultBranch: Branch | null,
  tags: Map<string, string>
): ReadonlyArray<string> {
  const selectedBranchRefs = new Set<string>()

  if (currentBranch !== null) {
    selectedBranchRefs.add(currentBranch.ref)
  }

  const mainBranch =
    defaultBranch ??
    branches.find(
      branch =>
        branch.type === BranchType.Local &&
        (branch.name === 'main' || branch.name === 'master')
    ) ??
    branches.find(
      branch =>
        branch.type === BranchType.Remote &&
        (branch.nameWithoutRemote === 'main' ||
          branch.nameWithoutRemote === 'master')
    ) ??
    null

  if (mainBranch !== null) {
    selectedBranchRefs.add(mainBranch.ref)
  }

  return branches
    .filter(
      branch =>
        !branch.isDesktopForkRemoteBranch && !selectedBranchRefs.has(branch.ref)
    )
    .map(branch => branch.ref)
    .concat(Array.from(tags.keys(), commitGraph_GetTagRef))
}
