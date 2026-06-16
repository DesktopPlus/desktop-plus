import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IDeleteAllLocalBranchesProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branches: ReadonlyArray<Branch>
  readonly onDismissed: () => void
  readonly onDeleted: (repository: Repository) => void
}

interface IDeleteAllLocalBranchesState {
  readonly isDeleting: boolean
}

export class DeleteAllLocalBranches extends React.Component<
  IDeleteAllLocalBranchesProps,
  IDeleteAllLocalBranchesState
> {
  public constructor(props: IDeleteAllLocalBranchesProps) {
    super(props)

    this.state = {
      isDeleting: false,
    }
  }

  public render() {
    const count = this.props.branches.length

    return (
      <Dialog
        id="delete-all-local-branches"
        title={
          __DARWIN__ ? 'Delete All Local Branches' : 'Delete all local branches'
        }
        type="warning"
        onSubmit={this.deleteBranches}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isDeleting}
        loading={this.state.isDeleting}
        role="alertdialog"
        ariaDescribedBy="delete-all-local-branches-message"
      >
        <DialogContent>
          <div id="delete-all-local-branches-message">
            <p>
              Delete the following {count}{' '}
              {count === 1 ? 'local branch' : 'local branches'}?
            </p>
            <ul className="delete-all-local-branches-list">
              {this.props.branches.map(branch => (
                <li key={branch.name}>
                  <Ref>{branch.name}</Ref>
                </li>
              ))}
            </ul>
            <p>This action cannot be undone.</p>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Delete" />
        </DialogFooter>
      </Dialog>
    )
  }

  private deleteBranches = async () => {
    const { dispatcher, repository, branches } = this.props

    this.setState({ isDeleting: true })

    await dispatcher.deleteLocalBranches(repository, branches)
    this.props.onDeleted(repository)

    this.props.onDismissed()
  }
}
