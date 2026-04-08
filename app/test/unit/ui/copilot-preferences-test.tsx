import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import { DefaultCopilotModel } from '../../../src/lib/stores/copilot-store'
import type { ModelInfo } from '@github/copilot-sdk'

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

const defaultModel = makeModel({
  id: DefaultCopilotModel,
  name: 'GPT-5 mini',
  billing: { multiplier: 1 },
})

const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { multiplier: 2 },
})

const models: ReadonlyArray<ModelInfo> = [defaultModel, otherModel]

describe('CopilotPreferences', () => {
  it('shows sign-in message when copilot is not available', () => {
    render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={[]}
        copilotAvailable={false}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to a GitHub.com account in the Accounts tab to configure Copilot settings.'
      )
    )
    assert.strictEqual(
      screen.queryByRole('combobox'),
      null,
      'Select should not be rendered when not available'
    )
  })

  it('shows loading message when copilot is available but models are empty', () => {
    render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={[]}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(screen.getByText('Loading available models…'))
    assert.strictEqual(
      screen.queryByRole('combobox'),
      null,
      'Select should not be rendered while loading'
    )
  })

  it('renders the model picker when models are available', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select')
    assert.notStrictEqual(select, null, 'Should render a select element')

    const options = view.container.querySelectorAll('option')
    assert.strictEqual(options.length, 2)
    assert.strictEqual(options[0].textContent, 'GPT-5 mini (default)')
    assert.strictEqual(options[1].textContent, 'Claude Sonnet')
  })

  it('selects the default model when selectedCopilotModel is null', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(select.value, DefaultCopilotModel)
  })

  it('selects the specified model when selectedCopilotModel is set', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModel="claude-sonnet"
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(select.value, 'claude-sonnet')
  })

  it('calls onSelectedCopilotModelChanged with model id on change', () => {
    const changed: Array<string | null> = []

    const view = render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={m => changed.push(m)}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'claude-sonnet' } })

    assert.deepStrictEqual(changed, ['claude-sonnet'])
  })

  it('calls onSelectedCopilotModelChanged with null when default is re-selected', () => {
    const changed: Array<string | null> = []

    const view = render(
      <CopilotPreferences
        selectedCopilotModel="claude-sonnet"
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={m => changed.push(m)}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: DefaultCopilotModel } })

    assert.deepStrictEqual(
      changed,
      [null],
      'Selecting default model should emit null'
    )
  })

  it('renders the heading text', () => {
    render(
      <CopilotPreferences
        selectedCopilotModel={null}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(screen.getByRole('heading', { level: 2 }))
  })
})
