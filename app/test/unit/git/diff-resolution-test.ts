import { describe, it } from 'node:test'
import assert from 'node:assert'
import { exec } from 'dugite'

import { DiffType, ITextDiff } from '../../../src/models/diff'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'
import { getResolutionDiff } from '../../../src/lib/git'

describe('git/diff/getResolutionDiff', () => {
  it('computes diff against merge base during active conflict', async t => {
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

    // Compute diff: merge base → resolved content
    const resolved = 'line 1\nmerged result\nline 3\n'
    const diff = await getResolutionDiff(repo, 'file.txt', {
      content: resolved,
    })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.hunks.length > 0)

    // Should show base → resolved (not conflict markers)
    const text = textDiff.text
    assert(!text.includes('<<<<<<<'), 'should not contain conflict markers')
    assert(text.includes('-line 2'), 'should delete original base line')
    assert(text.includes('+merged result'), 'should add resolved line')
  })

  it('falls back to on-disk content when not in a merge', async t => {
    const repo = await setupEmptyRepository(t)

    await makeCommit(repo, {
      entries: [{ path: 'file.txt', contents: 'original\n' }],
      commitMessage: 'init',
    })

    const resolved = 'modified\n'
    const diff = await getResolutionDiff(repo, 'file.txt', {
      content: resolved,
    })

    assert.equal(diff.kind, DiffType.Text)
    const textDiff = diff as ITextDiff
    assert(textDiff.text.includes('-original'))
    assert(textDiff.text.includes('+modified'))
  })
})
