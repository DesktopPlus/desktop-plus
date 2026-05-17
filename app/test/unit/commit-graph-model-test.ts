import { describe, it } from 'node:test'
import assert from 'node:assert'
import { commitGraph_buildRows } from '../../src/ui/history/commit-graph-model'
import { Commit } from '../../src/models/commit'
import { CommitIdentity } from '../../src/models/commit-identity'

function commitGraph_makeTestCommit(
  sha: string,
  parentSHAs: ReadonlyArray<string>
): Commit {
  const identity = new CommitIdentity(
    'Test',
    'test@example.com',
    new Date(0),
    0
  )
  return new Commit(
    sha,
    sha.slice(0, 7),
    'summary',
    '',
    identity,
    identity,
    parentSHAs,
    [],
    []
  )
}

describe('commitGraph_buildRows', () => {
  it(
    'terminates when more lanes are allocated than the producible color palette',
    { timeout: 5000 },
    () => {
      // commitGraph_getColor produces a finite set of distinct strings (the
      // named palette + at most 361 distinct HSL hues). With no seeded
      // refColors, each disconnected root commit consumes one entry in the
      // dedup `usedColors` set. Before the loop cap, the allocation that
      // saturated the set caused an infinite loop on dedup. 400 disconnected
      // single-commit branches reliably exceed the producible-color count.
      const commits = Array.from({ length: 400 }, (_, i) =>
        commitGraph_makeTestCommit(`sha${i.toString().padStart(4, '0')}`, [])
      )

      const rows = commitGraph_buildRows(commits, [], undefined)

      assert.equal(rows.length, 400)
    }
  )
})
