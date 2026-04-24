import assert from 'node:assert'
import { describe, it } from 'node:test'
import { buildCommitMessageSystemPrompt } from '../../src/lib/stores/copilot-store'

describe('buildCommitMessageSystemPrompt', () => {
  it('returns the base system prompt unchanged when no rules are provided', () => {
    const base = buildCommitMessageSystemPrompt()
    const baseEmpty = buildCommitMessageSystemPrompt([])
    assert.equal(base, baseEmpty)
    assert.ok(
      !base.includes('commit message rules'),
      'base prompt should not mention commit message rules'
    )
  })

  it('appends a constraints section listing each rule when rules are provided', () => {
    const base = buildCommitMessageSystemPrompt()
    const augmented = buildCommitMessageSystemPrompt([
      'must start with "[DESK-123]"',
      'must not contain "WIP"',
    ])

    assert.ok(
      augmented.startsWith(base),
      'augmented prompt should start with the base prompt'
    )
    assert.ok(augmented.includes('- must start with "[DESK-123]"'))
    assert.ok(augmented.includes('- must not contain "WIP"'))
    assert.ok(
      augmented.includes('combined commit message'),
      'augmented prompt should explain that the constraints apply to the full commit message'
    )
  })
})
