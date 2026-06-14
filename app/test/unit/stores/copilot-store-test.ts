import { describe, it } from 'node:test'
import assert from 'node:assert'
import type { CopilotSession, ModelInfo } from '@github/copilot-sdk'
import {
  CopilotConflictResolutionAbortError,
  DefaultCopilotModel,
  getLowestReasoningEffort,
  getPreferredDefaultModel,
  getSupportedReasoningEffort,
  isCopilotConflictResolutionAbortError,
  runConflictResolutionTurn,
} from '../../../src/lib/stores/copilot-store'

function makeModel(
  overrides: Partial<ModelInfo> & Pick<ModelInfo, 'id' | 'name'>
): ModelInfo {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

describe('getLowestReasoningEffort', () => {
  it('returns undefined when model has no supported reasoning efforts', () => {
    const model = makeModel({ id: 'a', name: 'A' })
    assert.strictEqual(getLowestReasoningEffort(model), undefined)
  })

  it('returns undefined when supportedReasoningEfforts is empty', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: [],
    })
    assert.strictEqual(getLowestReasoningEffort(model), undefined)
  })

  it('returns low when it is the only supported effort', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['low'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'low')
  })

  it('returns low when multiple efforts are supported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['medium', 'high', 'low'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'low')
  })

  it('returns medium when low is not supported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['high', 'medium'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'medium')
  })

  it('returns xhigh when it is the only supported effort', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['xhigh'],
    })
    assert.strictEqual(getLowestReasoningEffort(model), 'xhigh')
  })
})

describe('getSupportedReasoningEffort', () => {
  it('returns undefined when the model supports no reasoning efforts', () => {
    const model = makeModel({ id: 'a', name: 'A' })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), undefined)
  })

  it('returns the preferred effort when the model supports it', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['low', 'medium', 'high'],
    })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), 'medium')
  })

  it('falls back to the lowest supported effort when preferred is unsupported', () => {
    const model = makeModel({
      id: 'a',
      name: 'A',
      supportedReasoningEfforts: ['high', 'xhigh'],
    })
    assert.strictEqual(getSupportedReasoningEffort(model, 'medium'), 'high')
  })
})

describe('getPreferredDefaultModel', () => {
  it('returns null for an empty model list', () => {
    assert.strictEqual(getPreferredDefaultModel([]), null)
  })

  it('returns the default model when it is in the list', () => {
    const defaultModel = makeModel({
      id: DefaultCopilotModel,
      name: 'GPT-5 mini',
      billing: { multiplier: 1 },
    })
    const other = makeModel({
      id: 'other-model',
      name: 'Other',
      billing: { multiplier: 0.5 },
    })
    // Even though 'other' is cheaper, the default model is preferred
    const result = getPreferredDefaultModel([other, defaultModel])
    assert.strictEqual(result, defaultModel)
  })

  it('falls back to the cheapest model by billing multiplier', () => {
    const expensive = makeModel({
      id: 'expensive',
      name: 'Expensive',
      billing: { multiplier: 10 },
    })
    const cheap = makeModel({
      id: 'cheap',
      name: 'Cheap',
      billing: { multiplier: 0.1 },
    })
    const mid = makeModel({
      id: 'mid',
      name: 'Mid',
      billing: { multiplier: 2 },
    })
    const result = getPreferredDefaultModel([expensive, mid, cheap])
    assert.strictEqual(result, cheap)
  })

  it('treats models without billing info as most expensive', () => {
    const noBilling = makeModel({
      id: 'no-billing',
      name: 'No Billing',
    })
    const withBilling = makeModel({
      id: 'with-billing',
      name: 'With Billing',
      billing: { multiplier: 5 },
    })
    const result = getPreferredDefaultModel([noBilling, withBilling])
    assert.strictEqual(result, withBilling)
  })

  it('returns the single model when only one is available', () => {
    const only = makeModel({
      id: 'only-model',
      name: 'Only Model',
      billing: { multiplier: 3 },
    })
    const result = getPreferredDefaultModel([only])
    assert.strictEqual(result, only)
  })

  it('prefers default model regardless of billing cost', () => {
    const defaultModel = makeModel({
      id: DefaultCopilotModel,
      name: 'GPT-5 mini',
      billing: { multiplier: 100 },
    })
    const cheapModel = makeModel({
      id: 'cheap',
      name: 'Cheap',
      billing: { multiplier: 0.01 },
    })
    const result = getPreferredDefaultModel([cheapModel, defaultModel])
    assert.strictEqual(result, defaultModel)
  })
})

/**
 * A minimal fake of the bits of `CopilotSession` that
 * `runConflictResolutionTurn` interacts with: event subscription (returning an
 * unsubscribe fn), `send`, and `disconnect`. Lets us drive the streaming turn
 * deterministically and assert teardown behaviour.
 */
function createFakeSession() {
  const handlers: Record<string, Array<(event: unknown) => void>> = {}
  let unsubCalls = 0
  let disconnectCalls = 0
  let sendCalls = 0

  const session = {
    on(event: string, handler: (event: unknown) => void) {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(handler)
      let unsubscribed = false
      return () => {
        if (!unsubscribed) {
          unsubscribed = true
          unsubCalls++
        }
      }
    },
    send() {
      sendCalls++
      // Never settles on its own — the turn completes via emitted events.
      return new Promise<void>(() => {})
    },
    disconnect() {
      disconnectCalls++
      return Promise.resolve()
    },
  }

  const emit = (event: string, data: unknown) => {
    for (const handler of handlers[event] ?? []) {
      handler({ data })
    }
  }

  return {
    session: session as unknown as CopilotSession,
    emit,
    get unsubCalls() {
      return unsubCalls
    },
    get disconnectCalls() {
      return disconnectCalls
    },
    get sendCalls() {
      return sendCalls
    },
  }
}

describe('runConflictResolutionTurn', () => {
  it('rejects as aborted and tears down the session when cancelled mid-turn', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      signal: controller.signal,
    })

    controller.abort()

    await assert.rejects(promise, (err: unknown) =>
      isCopilotConflictResolutionAbortError(err)
    )
    // The in-flight turn is torn down: session disconnected once, all four event
    // listeners unsubscribed exactly once.
    assert.strictEqual(fake.disconnectCalls, 1)
    assert.strictEqual(fake.unsubCalls, 4)
  })

  it('rejects and disconnects the session for an already-aborted signal', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      runConflictResolutionTurn(fake.session, 'prompt', {
        timeoutMs: 60_000,
        signal: controller.signal,
      }),
      (err: unknown) => err instanceof CopilotConflictResolutionAbortError
    )

    // The session is still disconnected even though we bailed before sending.
    assert.strictEqual(fake.disconnectCalls, 1)
    assert.strictEqual(fake.sendCalls, 0)
  })

  it('resolves with the final message content and disconnects the session once', async () => {
    const fake = createFakeSession()
    const controller = new AbortController()

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      signal: controller.signal,
    })

    fake.emit('assistant.message', { content: 'RESOLVED' })

    assert.strictEqual(await promise, 'RESOLVED')
    assert.strictEqual(fake.disconnectCalls, 1)

    // A late abort after completion must not re-tear-down or double-disconnect.
    controller.abort()
    assert.strictEqual(fake.disconnectCalls, 1)
  })

  it('streams reasoning snippets sentence-by-sentence', async () => {
    const fake = createFakeSession()
    const snippets: Array<string> = []

    const promise = runConflictResolutionTurn(fake.session, 'prompt', {
      timeoutMs: 60_000,
      onReasoningSnippet: snippet => snippets.push(snippet),
    })

    fake.emit('assistant.reasoning_delta', {
      deltaContent: 'Looking at both sides. Now comparing changes. ',
    })
    fake.emit('assistant.message', { content: 'RESOLVED' })

    await promise

    assert.deepStrictEqual(snippets, [
      'Looking at both sides.',
      'Now comparing changes.',
    ])
  })
})
