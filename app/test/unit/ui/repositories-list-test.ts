import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  Repository,
  ILocalRepositoryState,
} from '../../../src/models/repository'
import { WorktreeEntry } from '../../../src/models/worktree'
import { groupRepositories } from '../../../src/ui/repositories-list/group-repositories'
import { RepositoriesList } from '../../../src/ui/repositories-list/repositories-list'

const buildWorktree = (
  path: string,
  type: WorktreeEntry['type'],
  branch: string | null
): WorktreeEntry => ({
  path,
  type,
  branch,
  head: 'deadbeef',
  isDetached: branch === null,
  isLocked: false,
  isPrunable: false,
})

const buildLocalState = (
  worktrees: ReadonlyArray<WorktreeEntry>
): ILocalRepositoryState => ({
  aheadBehind: null,
  changedFilesCount: 0,
  branchName: 'feature',
  defaultBranchName: 'main',
  worktrees,
})

describe('RepositoriesList', () => {
  it('switches a synthetic root worktree row back to the root path', () => {
    const mainPath = '/tmp/project-alpha'
    const linkedPath = '/tmp/project-alpha-feature-a'
    const repository = new Repository(linkedPath, 1, null, false)
    const mainWorktree = buildWorktree(mainPath, 'main', 'refs/heads/main')
    const linkedWorktree = buildWorktree(
      linkedPath,
      'linked',
      'refs/heads/feature/feature-a'
    )
    const worktreeState = new Map<number, ILocalRepositoryState>([
      [repository.id, buildLocalState([mainWorktree, linkedWorktree])],
    ])
    const groups = groupRepositories([repository], worktreeState, [])
    const rootItem = groups[0].items[0]

    assert.equal(rootItem.isSyntheticWorktreeRoot, true)
    assert.equal(rootItem.worktree?.path, mainPath)

    let selectedRepository: Repository | null = null
    let switchedRepository: Repository | null = null
    let switchedWorktree: WorktreeEntry | null = null
    const dispatcher = {
      recordRepoClicked() {},
      closeFoldout() {},
      switchWorktree(repo: Repository, worktree: WorktreeEntry) {
        switchedRepository = repo
        switchedWorktree = worktree
      },
      postError(error: Error) {
        throw error
      },
    }

    const list = new RepositoriesList({
      dispatcher,
      onSelectionChanged: (repo: Repository) => {
        selectedRepository = repo
      },
    } as any)

    ;(list as any).onItemClick(rootItem)

    assert.equal(selectedRepository, null)
    assert.equal(switchedRepository, repository)
    assert.equal(switchedWorktree, mainWorktree)
  })
})
