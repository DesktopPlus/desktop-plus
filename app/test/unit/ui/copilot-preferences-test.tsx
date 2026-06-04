import assert from 'node:assert'
import { before, describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import {
  DefaultCopilotModel,
  type CopilotFeature,
} from '../../../src/lib/stores/copilot-store'
import {
  encodeModelKey,
  type IBYOKProvider,
} from '../../../src/lib/copilot/byok'
import type { CopilotModelInfo } from '../../../src/lib/copilot/model-info'

function makeModel(
  overrides: Partial<CopilotModelInfo> & Pick<CopilotModelInfo, 'id' | 'name'>
): CopilotModelInfo {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

const defaultModel = makeModel({
  id: DefaultCopilotModel,
  name: 'GPT-5 mini',
  billing: { kind: 'premium-requests', multiplier: 1 },
})

const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { kind: 'premium-requests', multiplier: 2 },
})

const usageBilledModel = makeModel({
  id: 'usage-billed-model',
  name: 'Usage Billed Model',
  billing: {
    kind: 'usage',
    tokenPrices: {
      batchSize: 1000000,
      default: {
        cachePrice: 50,
        contentMax: 200000,
        inputPrice: 500,
        outputPrice: 2500,
      },
    },
  },
})

const models: ReadonlyArray<CopilotModelInfo> = [
  defaultModel,
  otherModel,
  usageBilledModel,
]

const ollamaProvider: IBYOKProvider = {
  id: 'ollama-id',
  name: 'Ollama',
  type: 'openai',
  baseUrl: 'http://localhost:11434/v1',
  authKind: 'none',
  models: [
    { id: 'llama3', name: 'Llama 3' },
    { id: 'phi-4', name: 'Phi 4' },
  ],
}

class TestListResizeObserver implements ResizeObserver {
  public constructor(private readonly callback: ResizeObserverCallback) {}

  public observe(target: Element) {
    Object.defineProperty(target, 'offsetWidth', {
      configurable: true,
      value: 365,
    })
    Object.defineProperty(target, 'offsetHeight', {
      configurable: true,
      value: 360,
    })

    const contentRect = {
      x: 0,
      y: 0,
      width: 365,
      height: 360,
      top: 0,
      right: 365,
      bottom: 360,
      left: 0,
      toJSON: () => ({}),
    }

    this.callback(
      [
        {
          target,
          contentRect,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this
    )
  }

  public unobserve() {}

  public disconnect() {}
}

before(() => {
  Object.assign(window, { ResizeObserver: TestListResizeObserver })
})

function defaults() {
  return {
    selectedCopilotModels: {},
    copilotModels: models,
    copilotAvailable: true,
    byokProviders: [],
    showBYOKSettings: false,
    onSelectedCopilotModelChanged: () => {},
    onAddBYOKProvider: () => {},
    onEditBYOKProvider: () => {},
    onDeleteBYOKProvider: () => {},
  }
}

function getModelPickerButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector(
    '.copilot-model-picker > .button-component'
  )

  assert.ok(button instanceof HTMLButtonElement)

  return button
}

function getModelPickerButtonText(container: HTMLElement): string {
  return getModelPickerButton(container).textContent ?? ''
}

describe('CopilotPreferences', () => {
  it('shows sign-in message when copilot is not available', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={null}
        copilotAvailable={false}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to a GitHub.com account in the Accounts tab to configure Copilot settings.'
      )
    )
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows loading message when models not yet fetched', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={null} />)
    assert.ok(screen.getByText('Loading available models…'))
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(<CopilotPreferences {...defaults()} copilotModels={[]} />)
    assert.ok(
      screen.getByText('No models available. Check your Copilot subscription.')
    )
  })

  it('renders a Copilot group with the available models', async () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    fireEvent.click(getModelPickerButton(view.container))

    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    assert.ok(screen.getByText('GitHub Copilot'))
    assert.ok(screen.getAllByText('GPT-5 mini (1x) (default)').length >= 2)
    assert.ok(screen.getByText('Usage Billed Model'))
    assert.ok(screen.getByText('AI credits per 1M tokens'))
    assert.ok(screen.getByText('Input'))
    assert.ok(screen.getByText('500'))
    assert.ok(screen.getByText('Cached input'))
    assert.ok(screen.getByText('50'))
    assert.ok(screen.getByText('Output'))
    assert.ok(screen.getByText('2500'))
  })

  it('renders a BYOK group per provider', async () => {
    const view = render(
      <CopilotPreferences {...defaults()} byokProviders={[ollamaProvider]} />
    )

    fireEvent.click(getModelPickerButton(view.container))

    await waitFor(() => assert.ok(screen.getByText('Ollama')))
    assert.ok(screen.getByText('GitHub Copilot'))
  })

  it('selects the default Copilot model when no model is selected', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    assert.ok(
      getModelPickerButtonText(view.container).includes(
        'GPT-5 mini (1x) (default)'
      )
    )
    assert.ok(
      !getModelPickerButtonText(view.container).includes('GitHub Copilot')
    )
  })

  it('treats legacy bare-string selections as Copilot models', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
    )
  })

  it('selects the matching BYOK option when chosen', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        byokProviders={[ollamaProvider]}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: ollamaProvider.id,
            modelId: 'llama3',
          }),
        }}
      />
    )

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })

  it('emits the encoded composite key on change', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    fireEvent.click(screen.getByText('Claude Sonnet (2x)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' }),
      },
    ])
  })

  it('emits the selected value directly on change', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    await waitFor(() =>
      assert.ok(screen.getByText('GPT-5 mini (1x) (default)'))
    )
    fireEvent.click(screen.getByText('GPT-5 mini (1x) (default)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({
          kind: 'copilot',
          modelId: DefaultCopilotModel,
        }),
      },
    ])
  })

  it('falls back to the default Copilot model when persisted selection is not in the model list', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes(
        'GPT-5 mini (1x) (default)'
      )
    )
  })

  it('falls back to the default Copilot model when the BYOK provider for the persisted selection is gone', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModels={{
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: 'missing-provider',
            modelId: 'llama3',
          }),
        }}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes(
        'GPT-5 mini (1x) (default)'
      )
    )
  })

  it('falls back to the first available Copilot model when DefaultCopilotModel is unavailable', () => {
    const onlyOtherModel = [otherModel]
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={onlyOtherModel}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
    )
  })

  it('falls back to the first BYOK model when no Copilot models are available', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModels={[]}
        byokProviders={[ollamaProvider]}
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
      />
    )

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })

  it('hides the Providers tab when showBYOKSettings is false', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const tabs = view.container.querySelectorAll('[role="tab"]')
    assert.strictEqual(tabs.length, 0)
  })

  it('shows the Providers tab when enabled', () => {
    const view = render(
      <CopilotPreferences {...defaults()} showBYOKSettings={true} />
    )
    const tabs = view.container.querySelectorAll('[role="tab"]')
    const providersTab = Array.from(tabs).find(t =>
      (t.textContent ?? '').toLowerCase().includes('providers')
    )
    assert.ok(providersTab)
  })

  it('invokes onAddBYOKProvider when the Add button is clicked', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        showBYOKSettings={true}
        onAddBYOKProvider={() => {
          called += 1
        }}
      />
    )
    const tabs = view.container.querySelectorAll('[role="tab"]')
    const providersTab = Array.from(tabs).find(t =>
      (t.textContent ?? '').toLowerCase().includes('providers')
    )
    assert.ok(providersTab)
    fireEvent.click(providersTab!)
    const buttons = view.container.querySelectorAll('button')
    const addButton = Array.from(buttons).find(b =>
      (b.textContent ?? '').toLowerCase().includes('add provider')
    )
    assert.ok(addButton)
    fireEvent.click(addButton!)
    assert.strictEqual(called, 1)
  })

  describe('conflict resolution model picker', () => {
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES

    function withConflictResolutionEnabled(enabled: boolean, fn: () => void) {
      if (enabled) {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
      } else {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      }
      try {
        fn()
      } finally {
        if (previousPreviewFeatures === undefined) {
          delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
        } else {
          process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
        }
      }
    }

    it('is hidden when the feature flag is disabled', () => {
      withConflictResolutionEnabled(false, () => {
        const view = render(<CopilotPreferences {...defaults()} />)
        const selects = view.container.querySelectorAll('select')
        assert.strictEqual(selects.length, 1)
      })
    })

    it('renders a second picker when the feature flag is enabled', () => {
      withConflictResolutionEnabled(true, () => {
        const view = render(<CopilotPreferences {...defaults()} />)
        const selects = view.container.querySelectorAll('select')
        assert.strictEqual(selects.length, 2)
      })
    })

    it('emits the conflict-resolution feature on change', () => {
      withConflictResolutionEnabled(true, () => {
        const changed: Array<{
          feature: CopilotFeature
          model: string | null
        }> = []
        const view = render(
          <CopilotPreferences
            {...defaults()}
            onSelectedCopilotModelChanged={(f, m) =>
              changed.push({ feature: f, model: m })
            }
          />
        )
        const selects = view.container.querySelectorAll('select')
        const conflictSelect = selects[1] as HTMLSelectElement
        fireEvent.change(conflictSelect, {
          target: {
            value: encodeModelKey({
              kind: 'copilot',
              modelId: 'claude-sonnet',
            }),
          },
        })
        assert.deepStrictEqual(changed, [
          {
            feature: 'conflict-resolution',
            model: encodeModelKey({
              kind: 'copilot',
              modelId: 'claude-sonnet',
            }),
          },
        ])
      })
    })
  })
})
