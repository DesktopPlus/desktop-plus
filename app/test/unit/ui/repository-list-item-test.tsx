import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'

import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepositoryListItem } from '../../../src/ui/repositories-list/repository-list-item'
import { render, fireEvent, screen, waitFor } from '../../helpers/ui/render'
import { IMatches } from '../../../src/lib/fuzzy-find'
import { WorktreeEntry } from '../../../src/models/worktree'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

const noMatches: IMatches = { title: [], subtitle: [] }
const fixtureRepositoryPath = '/tmp/desktop-fixture'

function createRepository(alias: string | null = null) {
  const owner = new Owner('octocat', 'https://api.github.com', 1)
  const gitHubRepository = new GitHubRepository(
    'desktop',
    'github',
    owner,
    null,
    99
  )

  return new Repository(
    fixtureRepositoryPath,
    123,
    gitHubRepository,
    false,
    alias
  )
}

describe('RepositoryListItem', () => {
  beforeEach(() => {
    enableTestTimers(['setTimeout'])
  })

  afterEach(() => {
    resetTestTimers()
  })

  it('renders the repository name and status indicators', () => {
    const repository = createRepository()
    const view = render(
      <RepositoryListItem
        repository={repository}
        title="desktop"
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={{ ahead: 2, behind: 1 }}
        changedFilesCount={3}
        branchName={'main'}
        worktreePathDisambiguation={null}
        isNestedWorktree={false}
        isPrunableWorktree={false}
        worktree={null}
      />
    )

    const name = view.container.querySelector('.name')
    const aheadBehind = view.container.querySelector('.ahead-behind')
    const changeIndicator = view.container.querySelector(
      '.change-indicator-wrapper'
    )

    assert.equal(name?.textContent, 'desktop')
    assert.notEqual(aheadBehind, null)
    assert.notEqual(changeIndicator, null)
    assert.equal(aheadBehind?.querySelectorAll('svg').length, 2)
  })

  it('renders owner prefix and alias when disambiguation is required', () => {
    const repository = createRepository('desktop-app')
    const view = render(
      <RepositoryListItem
        repository={repository}
        title="desktop-app"
        needsDisambiguation={true}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
        branchName={'main'}
        worktreePathDisambiguation={null}
        isNestedWorktree={false}
        isPrunableWorktree={false}
        worktree={null}
      />
    )

    const prefix = view.container.querySelector('.prefix')
    const name = view.container.querySelector('.name')

    assert.equal(prefix?.textContent, 'octocat/')
    assert.equal(name?.textContent, 'octocat/desktop-app')
  })

  it('shows tooltip content for the repository full name, alias, and path', async () => {
    const repository = createRepository('desktop-app')
    const view = render(
      <RepositoryListItem
        repository={repository}
        title="desktop-app"
        needsDisambiguation={true}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
        branchName={'main'}
        worktreePathDisambiguation={null}
        isNestedWorktree={false}
        isPrunableWorktree={false}
        worktree={null}
      />
    )

    const row = view.container.querySelector('.repository-list-item')

    assert.notEqual(row, null)

    if (row === null) {
      throw new Error('Expected repository row to be rendered')
    }

    fireEvent.mouseEnter(row, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(row, { clientX: 20, clientY: 20 })
    advanceTimersBy(400)

    await waitFor(() => {
      assert.ok(screen.getByText('octocat/desktop', { selector: 'strong' }))
      assert.ok(screen.getByText(fixtureRepositoryPath))
    })
  })

  it('renders visible path disambiguation for duplicate-name worktree rows', () => {
    const repository = createRepository()
    const worktree: WorktreeEntry = {
      path: '/tmp/worktree-path/repo',
      type: 'linked',
      branch: null,
      head: 'deadbeef',
      isDetached: true,
      isLocked: false,
      isPrunable: false,
    }
    const view = render(
      <RepositoryListItem
        repository={repository}
        title="repo"
        needsDisambiguation={false}
        matches={noMatches}
        aheadBehind={null}
        changedFilesCount={0}
        branchName={null}
        worktreePathDisambiguation="/tmp/worktree-path"
        isNestedWorktree={true}
        isPrunableWorktree={false}
        worktree={worktree}
      />
    )

    const name = view.container.querySelector('.name')
    const pathDisambiguation = view.container.querySelector(
      '.worktree-path-disambiguation'
    )

    assert.equal(name?.textContent, 'repo')
    assert.equal(pathDisambiguation?.textContent, '/tmp/worktree-path')
  })
})
