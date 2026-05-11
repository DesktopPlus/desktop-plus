import * as React from 'react'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TextBox } from '../lib/text-box'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showOpenDialog } from '../main-process-proxy'
import { addWorktree, listWorktrees } from '../../lib/git/worktree'
import { match } from '../../lib/fuzzy-find'
import { HighlightText } from '../lib/highlight-text'

const MaxSuggestions = 7

interface IAddWorktreeDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
  readonly initialBranchName?: string
  readonly allBranches: ReadonlyArray<Branch>
}

interface IAddWorktreeDialogState {
  readonly path: string
  readonly branchName: string
  readonly creating: boolean
  readonly showSuggestions: boolean
  readonly selectedSuggestionIndex: number
}

export class AddWorktreeDialog extends React.Component<
  IAddWorktreeDialogProps,
  IAddWorktreeDialogState
> {
  public constructor(props: IAddWorktreeDialogProps) {
    super(props)

    this.state = {
      path: '',
      branchName: props.initialBranchName ?? '',
      creating: false,
      showSuggestions: false,
      selectedSuggestionIndex: -1,
    }
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
  }

  private onBranchNameChanged = (branchName: string) => {
    this.setState({
      branchName,
      showSuggestions: branchName.length > 0,
      selectedSuggestionIndex: -1,
    })
  }

  private showFilePicker = async () => {
    const path = await showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (path === null) {
      return
    }

    this.setState({ path })
  }

  private getFilteredBranches() {
    const { branchName } = this.state
    if (branchName.length === 0) {
      return []
    }

    const matches = match(branchName, this.props.allBranches, b => [b.name])
    return matches.slice(0, MaxSuggestions)
  }

  private branchExists(name: string): boolean {
    return this.props.allBranches.some(b => b.name === name)
  }

  private onSelectSuggestion = (name: string) => {
    this.setState({
      branchName: name,
      showSuggestions: false,
      selectedSuggestionIndex: -1,
    })
  }

  private onBranchNameKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (!this.state.showSuggestions) {
      return
    }

    const suggestions = this.getFilteredBranches()
    if (suggestions.length === 0) {
      return
    }

    const { selectedSuggestionIndex } = this.state

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.setState({
        selectedSuggestionIndex: Math.min(
          selectedSuggestionIndex + 1,
          suggestions.length - 1
        ),
      })
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.setState({
        selectedSuggestionIndex: Math.max(selectedSuggestionIndex - 1, -1),
      })
    } else if (event.key === 'Enter' && selectedSuggestionIndex >= 0) {
      event.preventDefault()
      this.onSelectSuggestion(suggestions[selectedSuggestionIndex].item.name)
    } else if (event.key === 'Escape') {
      this.setState({ showSuggestions: false })
    }
  }

  private onBranchNameBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // Only hide suggestions if focus left the container entirely
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      this.setState({ showSuggestions: false })
    }
  }

  private onBranchNameFocus = () => {
    if (this.state.branchName.length > 0) {
      this.setState({ showSuggestions: true })
    }
  }

  private onSubmit = async () => {
    const { path, branchName } = this.state

    this.setState({ creating: true })

    const branchExists = this.branchExists(branchName)

    try {
      await addWorktree(this.props.repository, path, {
        branch: branchExists ? branchName : undefined,
        createBranch:
          !branchExists && branchName.length > 0 ? branchName : undefined,
      })
    } catch (e) {
      this.props.dispatcher.postError(e)
      this.setState({ creating: false })
      return
    }

    const { dispatcher, repository } = this.props
    const worktrees = await listWorktrees(repository)
    const worktree = worktrees.find(wt => wt.path === path)

    if (!worktree) {
      this.props.dispatcher.postError(
        new Error('Failed to find the newly created worktree')
      )
      this.setState({ creating: false })
      return
    }

    await dispatcher.switchWorktree(repository, worktree)

    this.setState({ creating: false })
    this.props.onDismissed()
  }

  private onSuggestionMouseDown = (event: React.MouseEvent<HTMLLIElement>) => {
    const name = event.currentTarget.dataset.branchName
    if (name !== undefined) {
      this.onSelectSuggestion(name)
    }
  }

  private renderBranchSuggestions() {
    if (!this.state.showSuggestions) {
      return null
    }

    const suggestions = this.getFilteredBranches()
    if (suggestions.length === 0) {
      return null
    }

    return (
      <ul className="branch-suggestions" role="listbox">
        {suggestions.map((s, i) => (
          <li
            key={s.item.name}
            className={
              i === this.state.selectedSuggestionIndex ? 'selected' : undefined
            }
            role="option"
            aria-selected={i === this.state.selectedSuggestionIndex}
            data-branch-name={s.item.name}
            onMouseDown={this.onSuggestionMouseDown}
          >
            <HighlightText text={s.item.name} highlight={s.matches.title} />
          </li>
        ))}
      </ul>
    )
  }

  private renderBranchStatus() {
    const { branchName } = this.state
    if (branchName.length === 0) {
      return null
    }

    const exists = this.branchExists(branchName)
    const message = exists
      ? `Will check out existing branch "${branchName}"`
      : `Will create new branch "${branchName}"`

    return <p className="branch-status-hint">{message}</p>
  }

  public render() {
    const disabled = this.state.path.length === 0 || this.state.creating

    return (
      <Dialog
        id="add-worktree"
        title={__DARWIN__ ? 'Add Worktree' : 'Add worktree'}
        loading={this.state.creating}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Worktree Path' : 'Worktree path'}
              placeholder="worktree path"
              onValueChanged={this.onPathChanged}
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>

          <Row>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              className="branch-name-with-suggestions"
              onKeyDown={this.onBranchNameKeyDown}
              onFocus={this.onBranchNameFocus}
              onBlur={this.onBranchNameBlur}
            >
              <RefNameTextBox
                label={__DARWIN__ ? 'Branch Name' : 'Branch name'}
                initialValue={this.state.branchName}
                onValueChange={this.onBranchNameChanged}
              />
              {this.renderBranchSuggestions()}
              {this.renderBranchStatus()}
            </div>
          </Row>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Create Worktree' : 'Create worktree'}
            okButtonDisabled={disabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
