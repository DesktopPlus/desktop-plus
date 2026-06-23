import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildPinnedGroup,
  filterPinnedFromGroups,
  groupRepositories,
  isRepositoryListItemPinned,
} from '../../src/ui/repositories-list/group-repositories'
import {
  getWorktreeFamilyRepositories,
  shouldShowRepositoryListBranchName,
} from '../../src/ui/repositories-list/repositories-list'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { WorktreeEntry } from '../../src/models/worktree'
import { match } from '../../src/lib/fuzzy-find'
import { ShowBranchNameInRepoListSetting } from '../../src/models/show-branch-name-in-repo-list'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  const buildWorktree = (
    path: string,
    type: WorktreeEntry['type'],
    branch: string | null,
    isPrunable: boolean = false
  ): WorktreeEntry => ({
    path,
    type,
    branch,
    head: 'deadbeef',
    isDetached: branch === null,
    isLocked: false,
    isPrunable,
  })

  const buildLocalState = (
    worktrees: ReadonlyArray<WorktreeEntry>,
    overrides: Partial<Omit<ILocalRepositoryState, 'worktrees'>> = {}
  ): ILocalRepositoryState => ({
    aheadBehind: null,
    changedFilesCount: 0,
    branchName: 'main',
    defaultBranchName: 'main',
    worktrees,
    ...overrides,
  })

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.repository.path, 'repo2')

    assert.equal(grouped[1].identifier.kind, 'enterprise')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.repository.path, 'repo3')

    assert.equal(grouped[2].identifier.kind, 'other')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.repository.path, 'repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 2)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 2)

    let items = grouped[0].items
    assert.equal(items[0].repository.path, 'b')
    assert.equal(items[1].repository.path, 'd')

    assert.equal(grouped[1].identifier.kind, 'other')
    assert.equal(grouped[1].items.length, 3)

    items = grouped[1].items
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'c')
    assert.equal(items[2].repository.path, 'z')
  })

  it('only disambiguates Enterprise repositories', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'business',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'user1')
    assert.equal(grouped[0].items.length, 1)

    assert.equal(grouped[1].identifier.kind, 'dotcom')
    assert.equal((grouped[1].identifier as any).owner.login, 'user2')
    assert.equal(grouped[1].items.length, 1)

    assert.equal(grouped[2].identifier.kind, 'enterprise')
    assert.equal(grouped[2].items.length, 2)

    assert.equal(grouped[0].items[0].text[0], 'repo')
    assert(!grouped[0].items[0].needsDisambiguation)

    assert.equal(grouped[1].items[0].text[0], 'repo')
    assert(!grouped[1].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[0].text[0], 'enterprise-repo')
    assert(grouped[2].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[1].text[0], 'enterprise-repo')
    assert(grouped[2].items[1].needsDisambiguation)
  })

  it('deduplicates saved repositories from the same worktree family', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([linkedRepo, mainRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.deepEqual(
      grouped[0].items.map(item => item.repository.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.isNestedWorktree),
      [false, true]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.sourceRepository?.path ?? null),
      [null, mainPath]
    )
  })

  it('keeps saved worktree repositories flat when sidebar worktree rows are disabled', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [linkedRepo, mainRepo],
      worktreeCache,
      [],
      {
        showWorktreesInRepoList: false,
      }
    )

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.deepEqual(
      grouped[0].items.map(item => item.repository.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree),
      [null, null]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.isNestedWorktree),
      [false, false]
    )
  })

  it('uses linked worktree state to render a saved main worktree family', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const linkedAheadBehind = { ahead: 1, behind: 0 }
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [
        linkedRepo.id,
        buildLocalState(worktrees, {
          aheadBehind: linkedAheadBehind,
          changedFilesCount: 3,
        }),
      ],
    ])

    const grouped = groupRepositories([linkedRepo, mainRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.deepEqual(
      grouped[0].items.map(item => item.repository.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.isNestedWorktree),
      [false, true]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.changedFilesCount),
      [0, 3]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.aheadBehind),
      [null, linkedAheadBehind]
    )
  })

  it('does not show main repository status on linked worktree rows', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const mainAheadBehind = { ahead: 1, behind: 2 }
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [
        mainRepo.id,
        buildLocalState(worktrees, {
          aheadBehind: mainAheadBehind,
          changedFilesCount: 7,
        }),
      ],
    ])

    const grouped = groupRepositories([mainRepo, linkedRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.deepEqual(
      grouped[0].items.map(item => item.repository.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.changedFilesCount),
      [7, 0]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.aheadBehind),
      [mainAheadBehind, null]
    )
  })

  it('matches linked worktree rows by their worktree path name', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(
      linkedPath,
      2,
      null,
      false,
      'Feature A Worktree'
    )
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([mainRepo, linkedRepo], worktreeCache, [])
    const linkedItem = grouped[0].items[1]

    assert.equal(linkedItem.title, 'Feature A Worktree')
    assert(linkedItem.text.some(text => text.includes('main-repo-feature-a')))

    const filteredByLinkedWorktree = match(
      'feature-a',
      grouped[0].items,
      item => item.text
    )
    assert.deepEqual(
      new Set(filteredByLinkedWorktree.map(item => item.item.title)),
      new Set(['Feature A Worktree'])
    )
    const filteredByMainWorktree = match(
      'main-repo',
      grouped[0].items,
      item => item.text
    )
    assert.deepEqual(
      new Set(filteredByMainWorktree.map(item => item.item.title)),
      new Set(['main-repo', 'Feature A Worktree'])
    )
    const linkedRowMatchedByMainWorktree = filteredByMainWorktree.find(
      item => item.item.title === 'Feature A Worktree'
    )
    assert(linkedRowMatchedByMainWorktree !== undefined)
    assert.deepEqual(linkedRowMatchedByMainWorktree.matches.title, [])
    assert(linkedRowMatchedByMainWorktree.matches.subtitle.length > 0)
  })

  it('keeps same-name worktrees distinguishable by branch and path', () => {
    const mainPath = '/tmp/repo'
    const linkedPath = '/tmp/worktree-path/repo'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/same-name'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([mainRepo, linkedRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.deepEqual(
      grouped[0].items.map(item => item.title),
      ['repo', 'repo']
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.branchName),
      ['main', 'feature/same-name']
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.needsBranchNameDisambiguation),
      [true, true]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktreePathDisambiguation),
      ['/tmp', '/tmp/worktree-path']
    )
    assert.equal(
      shouldShowRepositoryListBranchName(
        grouped[0].items[0],
        ShowBranchNameInRepoListSetting.Never
      ),
      true
    )
    assert.equal(
      shouldShowRepositoryListBranchName(
        grouped[0].items[1],
        ShowBranchNameInRepoListSetting.Never
      ),
      true
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [mainPath, linkedPath]
    )

    const filteredByPathParent = match(
      'worktree-path',
      grouped[0].items,
      item => item.text
    )
    assert.deepEqual(
      new Set(filteredByPathParent.map(item => item.item.worktree?.path)),
      new Set([linkedPath])
    )
  })

  it('does not match linked worktrees through generic worktree parent directories', () => {
    const mainPath = '/tmp/repos/root-repo'
    const otherPath = '/tmp/repos/.worktrees/root-feature-a'
    const targetPath = '/tmp/repos/.worktrees/root-kts-target'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const otherRepo = new Repository(otherPath, 2, null, false)
    const targetRepo = new Repository(targetPath, 3, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(otherPath, 'linked', 'refs/heads/feature/feature-a'),
      buildWorktree(targetPath, 'linked', 'refs/heads/feature/kts-target'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [otherRepo.id, buildLocalState(worktrees)],
      [targetRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [mainRepo, otherRepo, targetRepo],
      worktreeCache,
      []
    )
    const filteredByKts = match('kts', grouped[0].items, item => item.text)

    assert.deepEqual(
      filteredByKts.map(item => item.item.worktree?.path),
      [targetPath]
    )
  })

  it('keeps detached same-name worktrees visibly distinguishable by path', () => {
    const mainPath = '/tmp/main-parent/repo'
    const linkedPath = '/tmp/linked-parent/repo'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', null),
      buildWorktree(linkedPath, 'linked', null),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([mainRepo, linkedRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.deepEqual(
      grouped[0].items.map(item => item.title),
      ['repo', 'repo']
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.branchName),
      [null, null]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktreePathDisambiguation),
      ['/tmp/main-parent', '/tmp/linked-parent']
    )
    assert.equal(
      shouldShowRepositoryListBranchName(
        grouped[0].items[0],
        ShowBranchNameInRepoListSetting.Never
      ),
      false
    )
    assert.equal(
      shouldShowRepositoryListBranchName(
        grouped[0].items[1],
        ShowBranchNameInRepoListSetting.Never
      ),
      false
    )
  })

  it('merges worktree family state when the first saved linked worktree has a stale cache', () => {
    const mainPath = '/tmp/main-repo'
    const featureBPath = '/tmp/main-repo-feature-b'
    const featureAPath = '/tmp/main-repo-feature-a'
    const featureBRepo = new Repository(featureBPath, 2, null, false)
    const featureARepo = new Repository(featureAPath, 3, null, false)
    const partialWorktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(featureBPath, 'linked', 'refs/heads/feature/feature-b'),
    ]
    const completeWorktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(featureBPath, 'linked', 'refs/heads/feature/feature-b'),
      buildWorktree(featureAPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [featureBRepo.id, buildLocalState(partialWorktrees)],
      [featureARepo.id, buildLocalState(completeWorktrees)],
    ])

    const grouped = groupRepositories(
      [featureBRepo, featureARepo],
      worktreeCache,
      []
    )

    assert.equal(grouped.length, 1)
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [mainPath, featureAPath, featureBPath]
    )
  })

  it('shows the root worktree and nests linked worktrees when the main worktree is not saved', () => {
    const mainPath = '/tmp/main-repo'
    const featureBPath = '/tmp/main-repo-feature-b'
    const featureAPath = '/tmp/main-repo-feature-a'
    const featureBRepo = new Repository(featureBPath, 2, null, false)
    const featureARepo = new Repository(featureAPath, 3, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(featureAPath, 'linked', 'refs/heads/feature/feature-a'),
      buildWorktree(featureBPath, 'linked', 'refs/heads/feature/feature-b'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [featureBRepo.id, buildLocalState(worktrees)],
      [featureARepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [featureARepo, featureBRepo],
      worktreeCache,
      []
    )

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 3)
    assert.deepEqual(
      grouped[0].items.map(item => item.title),
      ['main-repo', 'main-repo-feature-a', 'main-repo-feature-b']
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [mainPath, featureAPath, featureBPath]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.isNestedWorktree),
      [false, true, true]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.isSyntheticWorktreeRoot),
      [true, false, false]
    )
    assert.deepEqual(
      grouped[0].items.map(item => item.familyMainPath),
      [mainPath, mainPath, mainPath]
    )
    assert.equal(grouped[0].items[0].sourceRepository?.path, featureAPath)
    assert.equal(
      isRepositoryListItemPinned(
        grouped[0].items[0],
        [featureBRepo.id],
        [featureARepo, featureBRepo],
        worktreeCache
      ),
      true
    )
  })

  it('keeps pinned worktree families together when only one saved repository id is pinned', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([mainRepo, linkedRepo], worktreeCache, [])
    const pinsGroup = buildPinnedGroup([mainRepo.id], grouped)
    const filteredGroups = filterPinnedFromGroups([mainRepo.id], grouped)

    assert.notEqual(pinsGroup, null)
    assert.deepEqual(
      pinsGroup?.items.map(item => item.worktree?.path),
      [mainPath, linkedPath]
    )
    assert.equal(filteredGroups.length, 0)
  })

  it('preserves persisted pin order when expanding worktree families', () => {
    const featureAMainPath = '/tmp/feature-a'
    const featureALinkedPath = '/tmp/feature-a-feature'
    const featureBMainPath = '/tmp/feature-b'
    const featureBLinkedPath = '/tmp/feature-b-feature'
    const featureAMainRepo = new Repository(featureAMainPath, 1, null, false)
    const featureALinkedRepo = new Repository(
      featureALinkedPath,
      2,
      null,
      false
    )
    const featureBMainRepo = new Repository(featureBMainPath, 3, null, false)
    const featureBLinkedRepo = new Repository(
      featureBLinkedPath,
      4,
      null,
      false
    )
    const featureAWorktrees = [
      buildWorktree(featureAMainPath, 'main', 'refs/heads/main'),
      buildWorktree(
        featureALinkedPath,
        'linked',
        'refs/heads/feature/feature-a'
      ),
    ]
    const featureBWorktrees = [
      buildWorktree(featureBMainPath, 'main', 'refs/heads/main'),
      buildWorktree(
        featureBLinkedPath,
        'linked',
        'refs/heads/feature/feature-b'
      ),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [featureAMainRepo.id, buildLocalState(featureAWorktrees)],
      [featureALinkedRepo.id, buildLocalState(featureAWorktrees)],
      [featureBMainRepo.id, buildLocalState(featureBWorktrees)],
      [featureBLinkedRepo.id, buildLocalState(featureBWorktrees)],
    ])

    const grouped = groupRepositories(
      [
        featureAMainRepo,
        featureALinkedRepo,
        featureBMainRepo,
        featureBLinkedRepo,
      ],
      worktreeCache,
      []
    )
    const pinsGroup = buildPinnedGroup(
      [featureBMainRepo.id, featureAMainRepo.id],
      grouped
    )

    assert.deepEqual(
      pinsGroup?.items.map(item => item.worktree?.path),
      [
        featureBMainPath,
        featureBLinkedPath,
        featureAMainPath,
        featureALinkedPath,
      ]
    )
  })

  it('marks prunable worktrees in the sidebar item model', () => {
    const mainPath = '/tmp/main-repo'
    const stalePath = '/tmp/main-repo-stale'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(stalePath, 'linked', 'refs/heads/feature/stale', true),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories([mainRepo], worktreeCache, [])

    assert.equal(grouped.length, 1)
    assert.equal(grouped[0].items.length, 2)
    assert.equal(grouped[0].items[1].worktree?.path, stalePath)
    assert.equal(grouped[0].items[1].isPrunableWorktree, true)
    assert.equal(grouped[0].items[1].sourceRepository?.path, mainPath)
  })

  it('finds every saved worktree family repository for stale-prune refresh', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const stalePath = '/tmp/main-repo-stale'
    const unrelatedPath = '/tmp/unrelated-repo'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const unrelatedRepo = new Repository(unrelatedPath, 3, null, false)
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
      buildWorktree(stalePath, 'linked', 'refs/heads/feature/stale', true),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
      [
        unrelatedRepo.id,
        buildLocalState([
          buildWorktree(unrelatedPath, 'main', 'refs/heads/main'),
        ]),
      ],
    ])

    assert.deepEqual(
      getWorktreeFamilyRepositories(
        mainRepo,
        [mainRepo, linkedRepo, unrelatedRepo],
        worktreeCache
      ).map(repository => repository.path),
      [mainPath, linkedPath]
    )
    assert.deepEqual(
      getWorktreeFamilyRepositories(
        linkedRepo,
        [mainRepo, linkedRepo, unrelatedRepo],
        worktreeCache
      ).map(repository => repository.path),
      [mainPath, linkedPath]
    )
  })

  it('shows only the selected linked worktree in Recent', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const fillerRepos = Array.from(
      { length: 6 },
      (_, i) => new Repository(`/tmp/filler-${i}`, i + 10, null, false)
    )
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
      [linkedRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [mainRepo, linkedRepo, ...fillerRepos],
      worktreeCache,
      [{ repositoryId: linkedRepo.id, path: linkedPath }]
    )

    assert.equal(grouped[0].identifier.kind, 'recent')
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [linkedPath]
    )
  })

  it('shows the selected linked worktree in Recent when only the main worktree state is loaded', () => {
    const mainPath = '/tmp/main-repo'
    const linkedPath = '/tmp/main-repo-feature-a'
    const mainRepo = new Repository(mainPath, 1, null, false)
    const linkedRepo = new Repository(linkedPath, 2, null, false)
    const fillerRepos = Array.from(
      { length: 6 },
      (_, i) => new Repository(`/tmp/filler-${i}`, i + 10, null, false)
    )
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(linkedPath, 'linked', 'refs/heads/feature/feature-a'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [mainRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [mainRepo, linkedRepo, ...fillerRepos],
      worktreeCache,
      [{ repositoryId: linkedRepo.id, path: linkedPath }]
    )

    assert.equal(grouped[0].identifier.kind, 'recent')
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [linkedPath]
    )
  })

  it('shows recent worktree paths separately when they share a repository id', () => {
    const mainPath = '/tmp/main-repo'
    const featureAPath = '/tmp/main-repo-feature-a'
    const featureBPath = '/tmp/main-repo-feature-b'
    const currentRepo = new Repository(featureBPath, 1, null, false)
    const fillerRepos = Array.from(
      { length: 7 },
      (_, i) => new Repository(`/tmp/filler-${i}`, i + 10, null, false)
    )
    const worktrees = [
      buildWorktree(mainPath, 'main', 'refs/heads/main'),
      buildWorktree(featureAPath, 'linked', 'refs/heads/feature/feature-a'),
      buildWorktree(featureBPath, 'linked', 'refs/heads/feature/feature-b'),
    ]
    const worktreeCache = new Map<number, ILocalRepositoryState>([
      [currentRepo.id, buildLocalState(worktrees)],
    ])

    const grouped = groupRepositories(
      [currentRepo, ...fillerRepos],
      worktreeCache,
      [
        { repositoryId: currentRepo.id, path: featureAPath },
        { repositoryId: currentRepo.id, path: featureBPath },
      ]
    )

    assert.equal(grouped[0].identifier.kind, 'recent')
    assert.deepEqual(
      grouped[0].items.map(item => item.worktree?.path),
      [featureAPath, featureBPath]
    )
  })
})
