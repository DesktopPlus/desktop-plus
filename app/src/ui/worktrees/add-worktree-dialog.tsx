import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TextBox } from '../lib/text-box'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { showOpenDialog } from '../main-process-proxy'
import { addWorktree } from '../../lib/git/worktree'

interface IAddWorktreeDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IAddWorktreeDialogState {
  readonly path: string
  readonly branchName: string
  readonly creating: boolean
}

export class AddWorktreeDialog extends React.Component<
  IAddWorktreeDialogProps,
  IAddWorktreeDialogState
> {
  public constructor(props: IAddWorktreeDialogProps) {
    super(props)

    this.state = {
      path: '',
      branchName: '',
      creating: false,
    }
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
  }

  private onBranchNameChanged = (branchName: string) => {
    this.setState({ branchName })
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

  private onSubmit = async () => {
    const { path, branchName } = this.state

    this.setState({ creating: true })

    try {
      await addWorktree(this.props.repository, path, {
        createBranch: branchName.length > 0 ? branchName : undefined,
      })
    } catch (e) {
      this.props.dispatcher.postError(e)
      this.setState({ creating: false })
      return
    }

    const { dispatcher } = this.props
    const addedRepos = await dispatcher.addRepositories([path])

    if (addedRepos.length > 0) {
      await dispatcher.selectRepository(addedRepos[0])
    }

    this.setState({ creating: false })
    this.props.onDismissed()
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
            <RefNameTextBox
              label={__DARWIN__ ? 'New Branch Name' : 'New branch name'}
              initialValue=""
              onValueChange={this.onBranchNameChanged}
            />
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
