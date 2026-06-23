import { describe, it } from 'node:test'
import assert from 'node:assert'

import { Repository } from '../../src/models/repository'
import { WorktreeEntry } from '../../src/models/worktree'
import {
  generateRepositoryListContextMenu,
  generateSyntheticWorktreeRootContextMenu,
  generateWorktreeListItemContextMenu,
} from '../../src/ui/repositories-list/repository-list-item-context-menu'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { captureClipboardWrites } from '../helpers/ui/electron'

describe('repository list item context menu', () => {
  it('copies the repository name when a normal repository row has a worktree path', () => {
    const repository = new Repository(
      '/tmp/desktop-custom',
      1,
      gitHubRepoFixture({ owner: 'example', name: 'desktop' }),
      false
    )
    const clipboard = captureClipboardWrites()
    try {
      const items = generateRepositoryListContextMenu({
        repository,
        worktreePath: repository.path,
        shellLabel: undefined,
        externalEditorLabel: undefined,
        askForConfirmationOnRemoveRepository: false,
        onViewOnGitHub: () => {},
        onOpenInShell: () => {},
        onShowRepository: () => {},
        onOpenInExternalEditor: () => {},
        onRemoveRepository: () => {},
        onChangeRepositoryAlias: () => {},
        onRemoveRepositoryAlias: () => {},
        onChangeRepositoryGroupName: () => {},
        onRemoveRepositoryGroupName: () => {},
        onCopyRepoPath: () => {},
      })

      items
        .find(item => item.label?.toLowerCase().includes('copy repo name'))
        ?.action?.()

      assert.deepEqual(clipboard.writes, ['desktop'])
    } finally {
      clipboard.restore()
    }
  })

  it('copies the row worktree path when a repository row represents another worktree', () => {
    const repository = new Repository(
      '/tmp/repo-feature',
      1,
      gitHubRepoFixture({ owner: 'example', name: 'repo' }),
      false
    )
    let copiedPath: string | null = null
    const items = generateRepositoryListContextMenu({
      repository,
      worktreePath: '/tmp/repo',
      shellLabel: undefined,
      externalEditorLabel: undefined,
      askForConfirmationOnRemoveRepository: false,
      onViewOnGitHub: () => {},
      onOpenInShell: () => {},
      onShowRepository: () => {},
      onOpenInExternalEditor: () => {},
      onRemoveRepository: () => {},
      onChangeRepositoryAlias: () => {},
      onRemoveRepositoryAlias: () => {},
      onChangeRepositoryGroupName: () => {},
      onRemoveRepositoryGroupName: () => {},
      onCopyRepoPath: path => {
        copiedPath = path
      },
    })

    items
      .find(item => item.label?.toLowerCase().includes('copy repo path'))
      ?.action?.()

    assert.equal(copiedPath, '/tmp/repo')
  })

  it('keeps synthetic root worktree menu actions non-mutating', () => {
    const sourceRepository = new Repository(
      '/tmp/repo-feature',
      1,
      gitHubRepoFixture({ owner: 'example', name: 'repo' }),
      false
    )
    let copiedPath: string | null = null
    let unpinnedRepository: Repository | null = null
    const clipboard = captureClipboardWrites()
    try {
      const items = generateSyntheticWorktreeRootContextMenu({
        name: 'repo',
        path: '/tmp/repo',
        sourceRepository,
        isPinned: true,
        onCopyRepoPath: path => {
          copiedPath = path
        },
        onUnpinRepository: repository => {
          unpinnedRepository = repository
        },
      })

      const labels = items
        .map(item => item.label?.toLowerCase())
        .filter((label): label is string => label !== undefined)

      assert(labels.includes('unpin repository'))
      assert(labels.includes('copy repo name'))
      assert(labels.includes('copy repo path'))
      assert(!labels.some(label => label.includes('alias')))
      assert(!labels.some(label => label.includes('group')))
      assert(!labels.some(label => label.includes('remove')))
      assert(!labels.some(label => label.includes('open')))

      items
        .find(item => item.label?.toLowerCase().includes('copy repo name'))
        ?.action?.()
      items
        .find(item => item.label?.toLowerCase().includes('copy repo path'))
        ?.action?.()
      items
        .find(item => item.label?.toLowerCase().includes('unpin repository'))
        ?.action?.()

      assert.deepEqual(clipboard.writes, ['repo'])
      assert.equal(copiedPath, '/tmp/repo')
      assert.equal(unpinnedRepository, sourceRepository)
    } finally {
      clipboard.restore()
    }
  })

  it('disables stale worktree path actions while keeping prune available', () => {
    const repository = new Repository(
      '/tmp/repo',
      1,
      gitHubRepoFixture({ owner: 'example', name: 'repo' }),
      false
    )
    const worktree: WorktreeEntry = {
      path: '/tmp/repo-stale',
      type: 'linked',
      branch: 'refs/heads/feature/stale',
      head: 'deadbeef',
      isDetached: false,
      isLocked: false,
      isPrunable: true,
    }

    const items = generateWorktreeListItemContextMenu({
      repository,
      worktree,
      shellLabel: undefined,
      externalEditorLabel: undefined,
      onCreateWorktree: () => {},
      onRenameWorktree: () => {},
      onDeleteWorktree: () => {},
      onPruneStaleWorktrees: () => {},
      onViewOnGitHub: () => {},
      onOpenWorktreeInNewWindow: () => {},
      onOpenInShell: () => {},
      onShowRepository: () => {},
      onOpenInExternalEditor: () => {},
      onCopyWorktreePath: () => {},
    })

    const findItem = (label: string) =>
      items.find(item => item.label?.toLowerCase().includes(label))

    assert.equal(findItem('new worktree')?.enabled, false)
    assert.equal(findItem('rename worktree')?.enabled, false)
    assert.equal(findItem('open worktree in new window')?.enabled, false)
    assert.equal(findItem('open in shell')?.enabled, false)
    assert.equal(
      items.find(item =>
        [
          'reveal in finder',
          'show in explorer',
          'show in your file manager',
        ].includes(item.label?.toLowerCase() ?? '')
      )?.enabled,
      false
    )
    assert.equal(findItem('open in external editor')?.enabled, false)
    assert.equal(findItem('delete worktree')?.enabled, false)

    assert.notEqual(findItem('copy worktree path'), undefined)
    assert.notEqual(findItem('prune stale worktrees'), undefined)
  })
})
