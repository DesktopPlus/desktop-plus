import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'
import { assertNever } from '../../lib/fatal-error'
import { isGHE, isGHES } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import { normalizePath } from '../../lib/helpers/path'
import type { IRecentRepositorySelection } from '../../lib/app-state'

export type RepositoryListGroup = (
  | {
      kind: 'recent' | 'other' | 'pins'
    }
  | {
      kind: 'dotcom'
      owner: Owner
      login: string | null
    }
  | {
      kind: 'enterprise'
      host: string
    }
) & { displayName: string | null }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind, displayName } = group
  switch (kind) {
    case 'pins':
      return `-1:pins`
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return displayName
        ? `1:${displayName}`
        : `1:${group.owner.login}:${group.login ?? group.owner.login}`
    case 'enterprise':
      // Allow mixing together dotcom and enterprise repos when setting a group name manually
      return displayName ? `1:${displayName}` : `2:${group.host}`
    case 'other':
      return displayName ? `1:${displayName}` : `3:other`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly title: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly branchName: string | null
  readonly defaultBranchName: string | null
  readonly needsBranchNameDisambiguation: boolean
  readonly worktreePathDisambiguation: string | null
  readonly isNestedWorktree: boolean
  readonly isPrunableWorktree: boolean
  readonly isSyntheticWorktreeRoot: boolean
  readonly sourceRepository: Repository | null
  readonly familyMainPath: string | null
  /**
   * The worktree this row represents, when worktrees are shown in the list.
   *
   * The repository row carries the main worktree (so clicking it switches to
   * the main worktree); linked worktrees each get their own row nested below
   * it. `null` when worktree info isn't available (feature disabled or not yet
   * loaded), in which case the row is a plain repository row.
   */
  readonly worktree: WorktreeEntry | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (repo: Repositoryish): RepositoryListGroup => {
  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isGHE(repo.gitHubRepository.endpoint) ||
      isGHES(repo.gitHubRepository.endpoint)
      ? {
          kind: 'enterprise',
          host: getHostForRepository(repo),
          displayName: repo.groupName,
        }
      : {
          kind: 'dotcom',
          owner: repo.gitHubRepository.owner,
          displayName: repo.groupName,
          login: repo.gitHubRepository.login,
        }
  }
  if (repo instanceof Repository) {
    return { kind: 'other', displayName: repo.groupName }
  }
  return { kind: 'other', displayName: null }
}

type RepoGroupEntry = {
  readonly repository: Repositoryish
  readonly recentPath: string | null
}

type RepoGroupItem = { group: RepositoryListGroup; repos: RepoGroupEntry[] }

export interface IGroupRepositoriesOptions {
  /**
   * Whether linked worktrees should be expanded into nested repository-list
   * rows. Defaults to true for callers that do not have the preference.
   */
  readonly showWorktreesInRepoList?: boolean
}

const getMainWorktree = (
  worktrees: ReadonlyArray<WorktreeEntry>
): WorktreeEntry | null => worktrees.find(wt => wt.type === 'main') ?? null

const getFamilyMainPath = (
  repository: Repository,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): string | null => {
  const mainWorktree = getMainWorktree(
    localRepositoryStateLookup.get(repository.id)?.worktrees ?? []
  )

  return mainWorktree !== null ? normalizePath(mainWorktree.path) : null
}

const getFamilyMainPathFromLoadedState = (
  repository: Repository,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): string | null => {
  const directMainWorktreePath = getFamilyMainPath(
    repository,
    localRepositoryStateLookup
  )

  if (directMainWorktreePath !== null) {
    return directMainWorktreePath
  }

  const repositoryPath = normalizePath(repository.path)
  for (const state of localRepositoryStateLookup.values()) {
    const mainWorktree = getMainWorktree(state.worktrees)
    if (mainWorktree === null) {
      continue
    }

    if (state.worktrees.some(wt => normalizePath(wt.path) === repositoryPath)) {
      return normalizePath(mainWorktree.path)
    }
  }

  return null
}

export function isRepositoryListItemPinned(
  item: IRepositoryListItem,
  pinnedIds: ReadonlyArray<number>,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
): boolean {
  if (!(item.repository instanceof Repository)) {
    return false
  }

  const pinnedIdSet = new Set(pinnedIds)
  if (pinnedIdSet.has(item.repository.id)) {
    return true
  }

  if (item.familyMainPath === null) {
    return false
  }

  return repositories.some(
    repository =>
      repository instanceof Repository &&
      pinnedIdSet.has(repository.id) &&
      getFamilyMainPathFromLoadedState(
        repository,
        localRepositoryStateLookup
      ) === item.familyMainPath
  )
}

const getWorktreeDisplayTitle = (
  repository: Repository,
  worktree: WorktreeEntry
) =>
  normalizePath(repository.path) === normalizePath(worktree.path) &&
  repository.alias != null
    ? repository.alias
    : Path.basename(worktree.path)

const mergeWorktrees = (
  existing: ReadonlyArray<WorktreeEntry>,
  incoming: ReadonlyArray<WorktreeEntry>
): ReadonlyArray<WorktreeEntry> => {
  const byPath = new Map<string, WorktreeEntry>()

  for (const worktree of existing) {
    byPath.set(normalizePath(worktree.path), worktree)
  }

  for (const worktree of incoming) {
    byPath.set(normalizePath(worktree.path), worktree)
  }

  const worktrees = Array.from(byPath.values())
  return [
    ...worktrees.filter(worktree => worktree.type === 'main'),
    ...worktrees.filter(worktree => worktree.type === 'linked'),
  ]
}

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<IRecentRepositorySelection>,
  options: IGroupRepositoriesOptions = {}
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const showWorktreesInRepoList = options.showWorktreesInRepoList ?? true
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const groups = new Map<string, RepoGroupItem>()
  const repositoryByPath = new Map<string, Repository>()
  const repositoryById = new Map<number, Repositoryish>()
  const familySourceByMainPath = new Map<string, Repository>()
  const familyMainPathByRepositoryId = new Map<number, string>()
  const familyWorktreesByMainPath = new Map<
    string,
    ReadonlyArray<WorktreeEntry>
  >()

  for (const repo of repositories) {
    repositoryById.set(repo.id, repo)

    if (!(repo instanceof Repository)) {
      continue
    }

    const repositoryPath = normalizePath(repo.path)
    repositoryByPath.set(repositoryPath, repo)
  }

  if (showWorktreesInRepoList) {
    for (const repo of repositories) {
      if (!(repo instanceof Repository)) {
        continue
      }

      const mainWorktreePath = getFamilyMainPath(
        repo,
        localRepositoryStateLookup
      )
      if (mainWorktreePath === null) {
        continue
      }

      familyMainPathByRepositoryId.set(repo.id, mainWorktreePath)

      const worktrees = localRepositoryStateLookup.get(repo.id)?.worktrees ?? []
      const existingWorktrees = familyWorktreesByMainPath.get(mainWorktreePath)
      if (existingWorktrees === undefined) {
        familyWorktreesByMainPath.set(mainWorktreePath, worktrees)
      } else {
        familyWorktreesByMainPath.set(
          mainWorktreePath,
          mergeWorktrees(existingWorktrees, worktrees)
        )
      }

      if (!familySourceByMainPath.has(mainWorktreePath)) {
        familySourceByMainPath.set(mainWorktreePath, repo)
      }

      for (const worktree of worktrees) {
        const savedWorktreeRepository = repositoryByPath.get(
          normalizePath(worktree.path)
        )

        if (savedWorktreeRepository !== undefined) {
          familyMainPathByRepositoryId.set(
            savedWorktreeRepository.id,
            mainWorktreePath
          )
        }
      }
    }

    for (const mainWorktreePath of familyWorktreesByMainPath.keys()) {
      const mainRepository = repositoryByPath.get(mainWorktreePath)
      if (mainRepository === undefined) {
        continue
      }

      familySourceByMainPath.set(mainWorktreePath, mainRepository)
      familyMainPathByRepositoryId.set(mainRepository.id, mainWorktreePath)
    }
  }

  const addToGroup = (
    group: RepositoryListGroup,
    repo: Repositoryish,
    recentPath: string | null = null
  ) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push({ repository: repo, recentPath })
  }

  if (includeRecentGroup) {
    for (const recentRepository of recentRepositories) {
      const repo =
        repositoryByPath.get(normalizePath(recentRepository.path)) ??
        repositoryById.get(recentRepository.repositoryId)
      if (repo !== undefined) {
        addToGroup(
          { kind: 'recent', displayName: null },
          repo,
          recentRepository.path
        )
      }
    }
  }

  for (const repo of repositories) {
    let mainWorktreePath: string | null = null

    if (repo instanceof Repository && showWorktreesInRepoList) {
      mainWorktreePath = familyMainPathByRepositoryId.get(repo.id) ?? null
      const familySource =
        mainWorktreePath !== null
          ? familySourceByMainPath.get(mainWorktreePath)
          : undefined

      if (familySource !== undefined && familySource !== repo) {
        continue
      }
    }

    addToGroup(getGroupForRepository(repo), repo)
  }

  return Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey.toLowerCase(), yKey.toLowerCase()))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups,
        repositoryByPath,
        familyWorktreesByMainPath,
        showWorktreesInRepoList
      ),
    }))
    .filter(group => group.items.length > 0)
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<RepoGroupEntry>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>,
  repositoryByPath: ReadonlyMap<string, Repository>,
  familyWorktreesByMainPath: ReadonlyMap<string, ReadonlyArray<WorktreeEntry>>,
  showWorktreesInRepoList: boolean
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(entry =>
      getDisplayTitle(entry.repository)
    )) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  const rows = repositories.map(({ repository: r, recentPath }) => {
    const repoState = localRepositoryStateLookup.get(r.id)
    const title = getDisplayTitle(r)

    const needsDisambiguation =
      // If the repository is in the enterprise group and has a duplicate
      // name in the group, we need to disambiguate it. We don't have to
      // disambiguate repositories in the 'dotcom' group because they are
      // already grouped by owner. If the repository is in the 'recent'
      // group and has a duplicate name in any group, we need to
      // disambiguate it.
      ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
      ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent')

    return group.kind === 'recent'
      ? buildRecentRepositoryRows(
          r,
          repoState,
          needsDisambiguation,
          repositoryByPath,
          localRepositoryStateLookup,
          familyWorktreesByMainPath,
          showWorktreesInRepoList,
          recentPath
        )
      : buildRepositoryRows(
          r,
          repoState,
          needsDisambiguation,
          repositoryByPath,
          localRepositoryStateLookup,
          familyWorktreesByMainPath,
          showWorktreesInRepoList
        )
  })

  const flattenedRows =
    group.kind === 'recent'
      ? rows.flat()
      : rows
          .sort((x, y) => caseInsensitiveCompare(x[0].title, y[0].title))
          .flat()

  return group.kind === 'recent'
    ? withWorktreeBranchNameDisambiguation(flattenedRows)
    : flattenedRows
}

const shortBranchName = (branch: string | null): string | null =>
  branch ? branch.replace(/^refs\/heads\//, '') : null

const getSearchableParentDirectory = (path: string): string | null => {
  const parent = Path.basename(Path.dirname(path))
  const normalizedParent = parent.toLowerCase()

  // Keep meaningful parent directories searchable so same-name worktrees can
  // be distinguished by path, but ignore generic worktree containers. Those
  // containers would make short queries match unrelated worktree rows.
  return normalizedParent === 'worktrees' || normalizedParent === '.worktrees'
    ? null
    : parent
}

const getWorktreeSearchText = (
  title: string,
  repository: Repository,
  worktree: WorktreeEntry,
  mainWorktree: WorktreeEntry
): ReadonlyArray<string> => {
  const searchTerms = [
    nameOf(repository),
    Path.basename(worktree.path),
    shortBranchName(worktree.branch),
    Path.basename(mainWorktree.path),
    getSearchableParentDirectory(worktree.path),
  ].filter((text): text is string => text !== null && text.length > 0)

  return [title, Array.from(new Set(searchTerms)).join(' ')]
}

/**
 * Builds the list rows for a single repository: the repository row itself
 * (representing the main worktree) followed by one row per linked worktree.
 */
const buildPlainRepositoryRow = (
  r: Repositoryish,
  repoState: ILocalRepositoryState | undefined,
  needsDisambiguation: boolean
): IRepositoryListItem => {
  const title = getDisplayTitle(r)

  return {
    text: r instanceof Repository ? [title, nameOf(r)] : [title],
    id: r.id.toString(),
    title,
    repository: r,
    needsDisambiguation,
    aheadBehind: repoState?.aheadBehind ?? null,
    changedFilesCount: repoState?.changedFilesCount ?? 0,
    branchName: repoState?.branchName ?? null,
    defaultBranchName: repoState?.defaultBranchName ?? null,
    needsBranchNameDisambiguation: false,
    worktreePathDisambiguation: null,
    isNestedWorktree: false,
    isPrunableWorktree: false,
    isSyntheticWorktreeRoot: false,
    sourceRepository: null,
    familyMainPath: null,
    worktree: null,
  }
}

const findWorktreeFamilyForRepository = (
  repository: Repository,
  repoState: ILocalRepositoryState | undefined,
  familyWorktreesByMainPath: ReadonlyMap<string, ReadonlyArray<WorktreeEntry>>,
  targetPath: string
): ReadonlyArray<WorktreeEntry> => {
  const normalizedTargetPath = normalizePath(targetPath)
  const repoWorktrees = repoState?.worktrees ?? []
  const repoMainWorktree = getMainWorktree(repoWorktrees)

  if (repoMainWorktree !== null) {
    const family = familyWorktreesByMainPath.get(
      normalizePath(repoMainWorktree.path)
    )

    if (family !== undefined) {
      return family
    }
  }

  const directFamily = familyWorktreesByMainPath.get(normalizedTargetPath)
  if (directFamily !== undefined) {
    return directFamily
  }

  if (
    repoWorktrees.some(wt => normalizePath(wt.path) === normalizedTargetPath)
  ) {
    return repoWorktrees
  }

  for (const family of familyWorktreesByMainPath.values()) {
    if (family.some(wt => normalizePath(wt.path) === normalizedTargetPath)) {
      return family
    }
  }

  return repoWorktrees
}

const buildRecentRepositoryRows = (
  r: Repositoryish,
  repoState: ILocalRepositoryState | undefined,
  needsDisambiguation: boolean,
  repositoryByPath: ReadonlyMap<string, Repository>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  familyWorktreesByMainPath: ReadonlyMap<string, ReadonlyArray<WorktreeEntry>>,
  showWorktreesInRepoList: boolean,
  recentPath: string | null
): IRepositoryListItem[] => {
  if (!(r instanceof Repository) || !showWorktreesInRepoList) {
    return [buildPlainRepositoryRow(r, repoState, needsDisambiguation)]
  }

  const repositoryPath = normalizePath(r.path)
  const targetPath = normalizePath(recentPath ?? r.path)
  const worktrees = findWorktreeFamilyForRepository(
    r,
    repoState,
    familyWorktreesByMainPath,
    targetPath
  )
  const mainWorktree = getMainWorktree(worktrees)
  const worktree = worktrees.find(wt => normalizePath(wt.path) === targetPath)

  if (mainWorktree === null || worktree === undefined) {
    return [buildPlainRepositoryRow(r, repoState, needsDisambiguation)]
  }

  const worktreePath = normalizePath(worktree.path)
  const mainWorktreePath = normalizePath(mainWorktree.path)
  const mainRepository = repositoryByPath.get(mainWorktreePath)
  const rowRepository = repositoryByPath.get(worktreePath) ?? r
  const rowRepositoryState = localRepositoryStateLookup.get(rowRepository.id)
  const rowRepositoryMatchesWorktree =
    normalizePath(rowRepository.path) === worktreePath
  const title = getWorktreeDisplayTitle(rowRepository, worktree)
  const sourceIsRowWorktree = repositoryPath === worktreePath

  return [
    {
      text: getWorktreeSearchText(title, rowRepository, worktree, mainWorktree),
      id:
        worktree.type === 'main' && mainRepository !== undefined
          ? mainRepository.id.toString()
          : `${rowRepository.id}:${worktreePath}`,
      title,
      repository: rowRepository,
      needsDisambiguation,
      aheadBehind: rowRepositoryMatchesWorktree
        ? rowRepositoryState?.aheadBehind ??
          (sourceIsRowWorktree ? repoState?.aheadBehind ?? null : null)
        : null,
      changedFilesCount: rowRepositoryMatchesWorktree
        ? rowRepositoryState?.changedFilesCount ??
          (sourceIsRowWorktree ? repoState?.changedFilesCount ?? 0 : 0)
        : 0,
      branchName: shortBranchName(worktree.branch),
      defaultBranchName:
        rowRepositoryState?.defaultBranchName ??
        repoState?.defaultBranchName ??
        null,
      needsBranchNameDisambiguation: false,
      worktreePathDisambiguation: null,
      isNestedWorktree: worktree.type === 'linked',
      isPrunableWorktree: worktree.isPrunable,
      isSyntheticWorktreeRoot: false,
      sourceRepository:
        worktree.type === 'linked'
          ? mainRepository ?? r
          : mainRepository === undefined
          ? r
          : null,
      familyMainPath: mainWorktreePath,
      worktree,
    },
  ]
}

function buildRepositoryRows(
  r: Repositoryish,
  repoState: ILocalRepositoryState | undefined,
  needsDisambiguation: boolean,
  repositoryByPath: ReadonlyMap<string, Repository>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  familyWorktreesByMainPath: ReadonlyMap<string, ReadonlyArray<WorktreeEntry>>,
  showWorktreesInRepoList: boolean
): IRepositoryListItem[] {
  const defaultBranchName = repoState?.defaultBranchName ?? null

  const sourceRepositoryPath =
    r instanceof Repository ? normalizePath(r.path) : null
  const repoWorktrees = repoState?.worktrees ?? []
  const repoFamilyMainPath = getMainWorktree(repoWorktrees)?.path
  const familyWorktrees =
    repoFamilyMainPath !== undefined
      ? familyWorktreesByMainPath.get(normalizePath(repoFamilyMainPath))
      : sourceRepositoryPath !== null
      ? familyWorktreesByMainPath.get(sourceRepositoryPath)
      : undefined
  const worktrees =
    r instanceof Repository && showWorktreesInRepoList
      ? familyWorktrees ?? repoWorktrees
      : []
  const mainWorktree = getMainWorktree(worktrees)

  if (!(r instanceof Repository) || mainWorktree === null) {
    return [buildPlainRepositoryRow(r, repoState, needsDisambiguation)]
  }

  const mainWorktreePath = normalizePath(mainWorktree.path)
  const mainRepository = repositoryByPath.get(mainWorktreePath)

  const aheadBehind = repoState?.aheadBehind ?? null
  const changedFilesCount = repoState?.changedFilesCount ?? 0
  const mainRepositoryState =
    mainRepository !== undefined
      ? localRepositoryStateLookup.get(mainRepository.id)
      : undefined
  const mainRowRepository = mainRepository ?? r
  const mainTitle =
    mainRepository !== undefined
      ? getWorktreeDisplayTitle(mainRepository, mainWorktree)
      : Path.basename(mainWorktree.path)
  const sourceIsMainWorktree = sourceRepositoryPath === mainWorktreePath

  const mainWorktreeRow: IRepositoryListItem = {
    text: getWorktreeSearchText(
      mainTitle,
      mainRowRepository,
      mainWorktree,
      mainWorktree
    ),
    id:
      mainRepository !== undefined
        ? mainRepository.id.toString()
        : `${r.id}:${mainWorktreePath}`,
    title: mainTitle,
    repository: mainRowRepository,
    needsDisambiguation,
    aheadBehind:
      mainRepositoryState?.aheadBehind ??
      (sourceIsMainWorktree ? aheadBehind : null),
    changedFilesCount:
      mainRepositoryState?.changedFilesCount ??
      (sourceIsMainWorktree ? changedFilesCount : 0),
    branchName: shortBranchName(mainWorktree.branch),
    defaultBranchName:
      mainRepositoryState?.defaultBranchName ?? defaultBranchName,
    needsBranchNameDisambiguation: false,
    worktreePathDisambiguation: null,
    isNestedWorktree: false,
    isPrunableWorktree: mainWorktree.isPrunable,
    isSyntheticWorktreeRoot: mainRepository === undefined,
    sourceRepository: mainRepository === undefined ? r : null,
    familyMainPath: mainWorktreePath,
    worktree: mainWorktree,
  }

  const linkedWorktreeRows = worktrees
    .filter(wt => wt.type === 'linked')
    .sort(
      (x, y) =>
        caseInsensitiveCompare(Path.basename(x.path), Path.basename(y.path)) ||
        caseInsensitiveCompare(x.path, y.path)
    )
    .map((wt): IRepositoryListItem => {
      const worktreePath = normalizePath(wt.path)
      const rowRepository = repositoryByPath.get(worktreePath) ?? r
      const rowRepositoryState = localRepositoryStateLookup.get(
        rowRepository.id
      )
      const linkedTitle = getWorktreeDisplayTitle(rowRepository, wt)
      const rowRepositoryMatchesWorktree =
        normalizePath(rowRepository.path) === worktreePath
      const sourceIsRowWorktree = sourceRepositoryPath === worktreePath

      return {
        text: getWorktreeSearchText(
          linkedTitle,
          rowRepository,
          wt,
          mainWorktree
        ),
        id: `${rowRepository.id}:${worktreePath}`,
        title: linkedTitle,
        repository: rowRepository,
        needsDisambiguation: false,
        aheadBehind: rowRepositoryMatchesWorktree
          ? rowRepositoryState?.aheadBehind ??
            (sourceIsRowWorktree ? aheadBehind : null)
          : null,
        changedFilesCount: rowRepositoryMatchesWorktree
          ? rowRepositoryState?.changedFilesCount ??
            (sourceIsRowWorktree ? changedFilesCount : 0)
          : 0,
        branchName: shortBranchName(wt.branch),
        defaultBranchName:
          rowRepositoryState?.defaultBranchName ?? defaultBranchName,
        needsBranchNameDisambiguation: false,
        worktreePathDisambiguation: null,
        isNestedWorktree: true,
        isPrunableWorktree: wt.isPrunable,
        isSyntheticWorktreeRoot: false,
        sourceRepository: r,
        familyMainPath: mainWorktreePath,
        worktree: wt,
      }
    })

  return withWorktreeBranchNameDisambiguation([
    mainWorktreeRow,
    ...linkedWorktreeRows,
  ])
}

const withWorktreeBranchNameDisambiguation = (
  rows: ReadonlyArray<IRepositoryListItem>
): IRepositoryListItem[] => {
  const worktreeTitleCounts = new Map<string, number>()

  for (const row of rows) {
    if (row.worktree === null) {
      continue
    }

    worktreeTitleCounts.set(
      row.title,
      (worktreeTitleCounts.get(row.title) ?? 0) + 1
    )
  }

  return rows.map(row => {
    const needsWorktreeDisambiguation =
      row.worktree !== null && (worktreeTitleCounts.get(row.title) ?? 0) > 1

    return {
      ...row,
      needsBranchNameDisambiguation: needsWorktreeDisambiguation,
      worktreePathDisambiguation: needsWorktreeDisambiguation
        ? Path.dirname(row.worktree.path)
        : null,
    }
  })
}

/**
 * Extracts pinned items from existing groups and returns a Pins group, or null
 * if none of the pinned IDs are found in the groups.
 */
export function buildPinnedGroup(
  pinnedIds: ReadonlyArray<number>,
  allGroups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): IFilterListGroup<IRepositoryListItem, RepositoryListGroup> | null {
  if (pinnedIds.length === 0) {
    return null
  }

  const pinnedIdSet = new Set(pinnedIds)
  const idToFamilyKey = new Map<number, string>()
  const familyItems = new Map<string, IRepositoryListItem[]>()
  const idItems = new Map<number, IRepositoryListItem[]>()
  const completedIds = new Set<number>()
  const completedFamilyKeys = new Set<string>()

  for (const group of allGroups) {
    const groupIds = new Set<number>()
    const groupFamilyKeys = new Set<string>()

    for (const item of group.items) {
      const id = item.repository.id
      const familyKey = item.familyMainPath

      if (pinnedIdSet.has(id) && familyKey !== null) {
        idToFamilyKey.set(id, familyKey)
      }

      if (familyKey !== null) {
        if (completedFamilyKeys.has(familyKey)) {
          continue
        }

        const items = familyItems.get(familyKey)
        if (items === undefined) {
          familyItems.set(familyKey, [item])
        } else {
          items.push(item)
        }

        groupFamilyKeys.add(familyKey)
      } else {
        if (id <= 0 || completedIds.has(id)) {
          continue
        }

        groupIds.add(id)

        const items = idItems.get(id)
        if (items === undefined) {
          idItems.set(id, [item])
        } else {
          items.push(item)
        }
      }
    }

    for (const id of groupIds) {
      completedIds.add(id)
    }

    for (const familyKey of groupFamilyKeys) {
      completedFamilyKeys.add(familyKey)
    }
  }

  const items: IRepositoryListItem[] = []
  const emittedIds = new Set<number>()
  const emittedFamilyKeys = new Set<string>()
  for (const id of pinnedIds) {
    const familyKey = idToFamilyKey.get(id)
    if (familyKey !== undefined) {
      if (emittedFamilyKeys.has(familyKey)) {
        continue
      }

      const family = familyItems.get(familyKey)
      if (family !== undefined) {
        items.push(...family)
        emittedFamilyKeys.add(familyKey)
      }

      continue
    }

    if (emittedIds.has(id)) {
      continue
    }

    const pinnedItems = idItems.get(id)
    if (pinnedItems !== undefined) {
      items.push(...pinnedItems)
      emittedIds.add(id)
    }
  }

  if (items.length === 0) {
    return null
  }

  return { identifier: { kind: 'pins', displayName: null }, items }
}

/**
 * Returns groups with pinned items removed so they only appear in the Pins group.
 */
export function filterPinnedFromGroups(
  pinnedIds: ReadonlyArray<number>,
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  if (pinnedIds.length === 0) {
    return groups
  }

  const pinnedIdSet = new Set(pinnedIds)
  const pinnedFamilyKeys = new Set<string>()
  for (const group of groups) {
    for (const item of group.items) {
      if (pinnedIdSet.has(item.repository.id) && item.familyMainPath !== null) {
        pinnedFamilyKeys.add(item.familyMainPath)
      }
    }
  }

  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(
        item =>
          !pinnedIdSet.has(item.repository.id) &&
          (item.familyMainPath === null ||
            !pinnedFamilyKeys.has(item.familyMainPath))
      ),
    }))
    .filter(group => group.items.length > 0)
}
