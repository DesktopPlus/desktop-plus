import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'

import { DiffType, ITextDiff } from '../../../src/models/diff'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'
import { getResolutionDiff } from '../../../src/lib/git'

describe('git/diff/getResolutionDiff (stage mode)', () => {
  it('computes diff for ours (:2) during active conflict', async t => {
    const repo = await setupEmptyRepository(t)

    // Create base commit
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'line 1\nline 2\nline 3\n' }],
      commitMessage: 'base',
    })

    // Create conflicting branch
    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nfeature change\nline 3\n' },
      ],
      commitMessage: 'feature',
    })

    // Create conflicting change on master
    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nmaster change\nline 3\n' },
      ],
      commitMessage: 'master',
    })

    // Start merge (will conflict)
    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // Compute ours diff: merge base → :2: (master's version)
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'ours' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.hunks.length > 0)
    assert(textDiff.text.includes('-line 2'), 'should delete base line')
    assert(
      textDiff.text.includes('+master change'),
      'should show master version'
    )
  })

  it('computes diff for theirs (:3) during active conflict', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'line 1\nline 2\nline 3\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nfeature change\nline 3\n' },
      ],
      commitMessage: 'feature',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [
        { path: 'file.txt', contents: 'line 1\nmaster change\nline 3\n' },
      ],
      commitMessage: 'master',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // Compute theirs diff: merge base → :3: (feature's version)
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'theirs' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.hunks.length > 0)
    assert(
      textDiff.text.includes('+feature change'),
      'should show feature version'
    )
  })

  it('shows all-deletion diff when file deleted in requested stage', async t => {
    const repo = await setupEmptyRepository(t)

    // Create base with the file
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'base content\n' }],
      commitMessage: 'base',
    })

    // Feature branch deletes the file
    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: null }],
      commitMessage: 'feature deletes file',
    })

    // Master modifies the file to create a modify/delete conflict
    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'master modified\n' }],
      commitMessage: 'master modifies file',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // file.txt was deleted in feature (:3 doesn't exist), but base (:1) does.
    // Should produce an all-deletion diff (base → empty), same as how deleted
    // files appear in the regular changes view.
    const diff = await getResolutionDiff(repo, 'file.txt', { stage: 'theirs' })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(
      textDiff.text.includes('-base content'),
      'should show base content as deleted'
    )
  })

  it('returns Unrenderable when neither base nor stage exists', async t => {
    const repo = await setupEmptyRepository(t)

    // Create base with a shared file to ensure merge has a common ancestor
    await makeCommit(repo, {
      entries: [{ path: 'shared.txt', contents: 'shared\n' }],
      commitMessage: 'base',
    })

    // Feature branch adds a new file
    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [
        { path: 'shared.txt', contents: 'shared modified\n' },
        { path: 'new-file.txt', contents: 'only in feature\n' },
      ],
      commitMessage: 'feature adds file',
    })

    // Master modifies shared file to create a conflict
    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'shared.txt', contents: 'shared changed\n' }],
      commitMessage: 'master changes shared',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // new-file.txt has no base (:1) and no ours (:2) — only exists in :3
    const diff = await getResolutionDiff(repo, 'new-file.txt', {
      stage: 'ours',
    })
    assert.equal(diff.kind, DiffType.Unrenderable)
  })

  it('respects hideWhitespaceInDiff flag', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello world\n' }],
      commitMessage: 'base',
    })

    await switchTo(repo, 'feature')
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello  world\nextra\n' }],
      commitMessage: 'feature',
    })

    await exec(['checkout', 'master'], repo.path)
    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'hello world\nother\n' }],
      commitMessage: 'master',
    })

    await exec(['merge', 'feature', '--no-commit'], repo.path)

    // With whitespace hidden, the spacing change should not appear as a diff
    const diff = await getResolutionDiff(
      repo,
      'file.txt',
      { stage: 'theirs' },
      true
    )

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    // The whitespace-only change (hello world → hello  world) should be
    // suppressed, but the content addition (extra) should still appear
    assert(
      textDiff.text.includes('+extra'),
      'should show non-whitespace changes'
    )
  })
})
