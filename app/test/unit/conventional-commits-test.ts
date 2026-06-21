import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseConventionalCommit } from '../../src/lib/conventional-commits'

describe('parseConventionalCommit', () => {
  it('parses a simple type', () => {
    const parsed = parseConventionalCommit('feat: add a new button')
    assert.deepStrictEqual(parsed, {
      rawType: 'feat',
      label: 'Feat',
      scope: null,
      rest: 'add a new button',
    })
  })

  it('parses a type with a scope', () => {
    const parsed = parseConventionalCommit('fix(parser): handle empty input')
    assert.deepStrictEqual(parsed, {
      rawType: 'fix',
      label: 'Fix',
      scope: 'parser',
      rest: 'handle empty input',
    })
  })

  it('marks breaking changes with a trailing exclamation mark', () => {
    assert.strictEqual(
      parseConventionalCommit('feat!: drop node 16')?.label,
      'Feat!'
    )
    assert.strictEqual(
      parseConventionalCommit('refactor(api)!: rename method')?.label,
      'Refactor!'
    )
  })

  it('maps every recognised type to its label', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['feat', 'Feat'],
      ['fix', 'Fix'],
      ['fixes', 'Fixes'],
      ['hotfix', 'Hotfix'],
      ['chore', 'Chore'],
      ['revert', 'Revert'],
      ['style', 'Style'],
      ['spelling', 'Spelling'],
      ['docs', 'Docs'],
      ['doc', 'Doc'],
      ['build', 'Build'],
      ['refactor', 'Refactor'],
      ['test', 'Test'],
      ['ci', 'CI'],
      ['perf', 'Perf'],
      ['deps', 'Deps'],
      ['security', 'Security'],
      ['release', 'Release'],
      ['temp', 'Temp'],
      ['wip', 'WIP'],
      ['config', 'Config'],
      ['infra', 'Infra'],
      ['ops', 'Ops'],
      ['ui', 'UI'],
      ['ux', 'UX'],
      ['design', 'Design'],
    ]

    for (const [type, label] of cases) {
      const parsed = parseConventionalCommit(`${type}: do the thing`)
      assert.strictEqual(parsed?.rawType, type)
      assert.strictEqual(parsed?.label, label)
    }
  })

  it('tolerates extra whitespace after the colon', () => {
    assert.strictEqual(
      parseConventionalCommit('docs:    update readme')?.rest,
      'update readme'
    )
  })

  it('tolerates leading whitespace before the type', () => {
    assert.deepStrictEqual(
      parseConventionalCommit(' fix: LC-9677 - cache languages'),
      {
        rawType: 'fix',
        label: 'Fix',
        scope: null,
        rest: 'LC-9677 - cache languages',
      }
    )
    assert.strictEqual(
      parseConventionalCommit('\tfeat: add thing')?.label,
      'Feat'
    )
  })

  it('returns null for unrecognised types', () => {
    assert.strictEqual(parseConventionalCommit('note: heads up'), null)
    assert.strictEqual(parseConventionalCommit('merge: a branch'), null)
  })

  it('matches the type case-insensitively, normalising rawType to lower case', () => {
    assert.deepStrictEqual(parseConventionalCommit('Feat: capitalized'), {
      rawType: 'feat',
      label: 'Feat',
      scope: null,
      rest: 'capitalized',
    })
    assert.deepStrictEqual(parseConventionalCommit('FIX(API)!: shouting'), {
      rawType: 'fix',
      label: 'Fix!',
      scope: 'API',
      rest: 'shouting',
    })
  })

  it('returns null for non-conventional summaries', () => {
    assert.strictEqual(parseConventionalCommit('just a normal commit'), null)
    assert.strictEqual(parseConventionalCommit(''), null)
    assert.strictEqual(parseConventionalCommit('feat add button'), null)
    assert.strictEqual(parseConventionalCommit('feature: missing colon'), null)
  })
})
