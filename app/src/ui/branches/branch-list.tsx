import * as React from 'react'
import * as Path from 'path'

import { Branch, BranchType } from '../../models/branch'
import { WorktreeEntry } from '../../models/worktree'

import { assertNever } from '../../lib/fatal-error'

import { SelectionSource } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'

import {
  groupBranches,
  IBranchListItem,
  BranchGroupIdentifier,
} from './group-branches'
import { NoBranches } from './no-branches'
import { SelectionDirection, ClickSource } from '../lib/list'
import { generateBranchContextMenuItems } from './branch-list-item-context-menu'
import { showContextualMenu } from '../../lib/menu-item'
import { SectionFilterList } from '../lib/section-filter-list'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import memoizeOne from 'memoize-one'
import { Repository } from '../../models/repository'
import { formatDate } from '../../lib/format-date'
import { BranchSortOrder } from '../../models/branch-sort-order'

const RowHeight = 30

interface IBranchListProps {
  readonly repository: Repository

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch or null if HEAD is detached
   */
  readonly currentBranch: Branch | null

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * All worktrees in the repository.
   */
  readonly allWorktrees: ReadonlyArray<WorktreeEntry>

  /**
   * The sort order for branch lists in the current user preferences.
   */
  readonly branchSortOrder: BranchSortOrder

  /**
   * The currently selected branch in the list, see the onSelectionChanged prop.
   */
  readonly selectedBranch: Branch | null

  /**
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: Branch, source: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   *
   * @param selectedItem - The Branch that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (
    selectedItem: Branch | null,
    source: SelectionSource
  ) => void

  /** The current filter text to render */
  readonly filterText: string

  /** Callback to fire when the filter text is changed */
  readonly onFilterTextChanged: (filterText: string) => void

  /** Can users create a new branch? */
  readonly canCreateNewBranch: boolean

  /**
   * Called when the user wants to create a new branch. It will be given a name
   * to prepopulate the new branch name field.
   */
  readonly onCreateNewBranch?: (name: string) => void

  readonly textbox?: TextBox

  /** Aria label for a specific row */
  readonly getBranchAriaLabel: (item: IBranchListItem) => string | undefined

  /**
   * Render function to apply to each branch in the list
   */
  readonly renderBranch: (
    item: IBranchListItem,
    matches: IMatches
  ) => JSX.Element

  /**
   * Callback to fire when the items in the filter list are updated
   */
  readonly onFilterListResultsChanged?: (resultCount: number) => void

  /** If true, we do not render the filter. */
  readonly hideFilterRow?: boolean

  /** Called to render content before/above the branches filter and list. */
  readonly renderPreList?: () => JSX.Element | null

  /** Optional: No branches message */
  readonly noBranchesMessage?: string | JSX.Element

  /** Optional: Callback for if rename context menu should exist */
  readonly onRenameBranch?: (branchName: string) => void

  /** Optional: Callback for if set as default branch context menu should exist */
  readonly onSetAsDefaultBranch?: (branchName: string) => void

  /** Optional: Callback for if delete context menu should exist */
  readonly onDeleteBranch?: (branchName: string) => void
}

/** The Branches list component. */
export class BranchList extends React.Component<IBranchListProps> {
  private branchFilterList: SectionFilterList<IBranchListItem> | null = null

  private getGroups = memoizeOne(groupBranches)
  private getSelectedItem = memoizeOne(
    (groups: ReturnType<typeof groupBranches>, selectedBranch: Branch | null) =>
      groups
        .flatMap(g => g.items)
        .find(i => i.branch.name === selectedBranch?.name) ?? null
  )

  /**
   * Generate a new object any time groups changes
   * in order to force the list to re-render.
   *
   * Note, change is determined by reference equality. This opaque object
   * will be passed down to the react-virtualized List component as a prop
   * causing it to re-render whenever either of these inputs change.
   *
   * Note that the return value here can be anything as long as it's not
   * considered equal (reference equality) to the previously returned value.
   * Using a guid which we used to do works but is overkill.
   */
  private getInvalidationProp = memoizeOne(
    (_groups: ReturnType<typeof groupBranches>) => ({})
  )

  private get invalidationProp() {
    return this.getInvalidationProp(this.groups)
  }

  private get groups() {
    return this.getGroups(
      this.props.defaultBranch,
      this.props.allBranches,
      this.props.recentBranches,
      this.props.allWorktrees,
      this.props.branchSortOrder
    )
  }

  private get selectedItem() {
    return this.getSelectedItem(this.groups, this.props.selectedBranch)
  }

  public selectNextItem(focus: boolean = false, direction: SelectionDirection) {
    if (this.branchFilterList !== null) {
      this.branchFilterList.selectNextItem(focus, direction)
    }
  }
  public render() {
    return (
      <SectionFilterList<IBranchListItem>
        ref={this.onBranchesFilterListRef}
        className="branches-list"
        rowHeight={RowHeight}
        filterText={this.props.filterText}
        onFilterTextChanged={this.props.onFilterTextChanged}
        onFilterKeyDown={this.props.onFilterKeyDown}
        selectedItem={this.selectedItem}
        renderItem={this.renderItem}
        renderRowFocusTooltip={this.renderRowFocusTooltip}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        onSelectionChanged={this.onSelectionChanged}
        onEnterPressedWithoutFilteredItems={this.onCreateNewBranch}
        groups={this.groups}
        invalidationProps={this.invalidationProp}
        renderPostFilter={this.onRenderNewButton}
        renderNoItems={this.onRenderNoItems}
        filterTextBox={this.props.textbox}
        hideFilterRow={this.props.hideFilterRow}
        onFilterListResultsChanged={this.props.onFilterListResultsChanged}
        renderPreList={this.props.renderPreList}
        onItemContextMenu={this.onBranchContextMenu}
        getItemAriaLabel={this.getItemAriaLabel}
        getGroupAriaLabel={this.getGroupAriaLabel}
      />
    )
  }

  private onBranchContextMenu = (
    item: IBranchListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const { onRenameBranch, onDeleteBranch, onSetAsDefaultBranch } = this.props

    if (
      onRenameBranch === undefined &&
      onDeleteBranch === undefined &&
      onSetAsDefaultBranch === undefined
    ) {
      return
    }

    const { type, name, nameWithoutRemote } = item.branch
    const isLocal = type === BranchType.Local
    const isInUseByOtherWorktree = !!this.inUseByOtherWorktreeName(item)

    const items = generateBranchContextMenuItems({
      name,
      nameWithoutRemote,
      isLocal,
      repoType: this.props.repository.gitHubRepository?.type,
      isInUseByOtherWorktree,
      onRenameBranch,
      onSetAsDefaultBranch:
        nameWithoutRemote === this.props.defaultBranch?.name
          ? undefined
          : onSetAsDefaultBranch,
      onDeleteBranch,
    })

    showContextualMenu(items)
  }

  private onBranchesFilterListRef = (
    filterList: SectionFilterList<IBranchListItem> | null
  ) => {
    this.branchFilterList = filterList
  }

  private renderItem = (item: IBranchListItem, matches: IMatches) => {
    return this.props.renderBranch(item, matches)
  }

  private renderRowFocusTooltip = (
    item: IBranchListItem
  ): JSX.Element | string | null => {
    const { tip, name } = item.branch

    const absoluteDate = formatDate(tip.author.date, {
      dateStyle: 'full',
      timeStyle: 'short',
    })

    const otherWorktreeName = this.inUseByOtherWorktreeName(item)
    return (
      <div className="branches-list-item-tooltip list-item-tooltip">
        {otherWorktreeName && (
          <div className="label tooltip-warning">
            This branch cannot be checked out because it is in use by worktree
            &quot;{otherWorktreeName}&quot;
          </div>
        )}
        <div>
          <div className="label">Full Name: </div>
          {name}
        </div>
        {absoluteDate && (
          <div>
            <div className="label">Last Modified: </div>
            {absoluteDate}
          </div>
        )}
      </div>
    )
  }

  private inUseByOtherWorktreeName(item: IBranchListItem): string | null {
    const worktreeName = item.worktreeInUse
      ? Path.basename(item.worktreeInUse.path)
      : null

    return worktreeName !== null &&
      this.props.currentBranch?.name !== item.branch.name
      ? worktreeName
      : null
  }

  private parseHeader(label: string): BranchGroupIdentifier | null {
    switch (label) {
      case 'default':
      case 'recent':
      case 'other':
        return label
      default:
        return null
    }
  }

  private getItemAriaLabel = (item: IBranchListItem) => {
    return this.props.getBranchAriaLabel(item)
  }

  private getGroupAriaLabel = (group: number) => {
    const identifier = this.groups[group].identifier as BranchGroupIdentifier
    return this.getGroupLabel(identifier)
  }

  private renderGroupHeader = (label: string) => {
    const identifier = this.parseHeader(label)

    return identifier !== null ? (
      <div className="branches-list-content filter-list-group-header">
        {this.getGroupLabel(identifier)}
      </div>
    ) : null
  }

  private getGroupLabel(identifier: BranchGroupIdentifier) {
    if (identifier === 'default') {
      return __DARWIN__ ? 'Default Branch' : 'Default branch'
    } else if (identifier === 'recent') {
      return __DARWIN__ ? 'Recent Branches' : 'Recent branches'
    } else if (identifier === 'other') {
      return __DARWIN__ ? 'Other Branches' : 'Other branches'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private onRenderNoItems = () => {
    return (
      <NoBranches
        onCreateNewBranch={this.onCreateNewBranch}
        canCreateNewBranch={this.props.canCreateNewBranch}
        noBranchesMessage={this.props.noBranchesMessage}
      />
    )
  }

  private onRenderNewButton = () => {
    return this.props.canCreateNewBranch ? (
      <Button
        className="new-branch-button button-with-icon"
        onClick={this.onCreateNewBranch}
      >
        <Octicon symbol={octicons.plus} className="mr" />
        {__DARWIN__ ? 'New Branch' : 'New branch'}
      </Button>
    ) : null
  }

  private onItemClick = (item: IBranchListItem, source: ClickSource) => {
    // Don't allow clicking branches that are in use by other worktrees
    if (item.worktreeInUse !== null) {
      const currentBranch = this.props.currentBranch
      const isCurrentBranch =
        currentBranch !== null && currentBranch.name === item.branch.name
      if (!isCurrentBranch) {
        return
      }
    }

    if (this.props.onItemClick) {
      this.props.onItemClick(item.branch, source)
    }
  }

  private onSelectionChanged = (
    selectedItem: IBranchListItem | null,
    source: SelectionSource
  ) => {
    // Don't allow selecting branches that are in use by other worktrees
    if (selectedItem?.worktreeInUse !== null) {
      const currentBranch = this.props.currentBranch
      const isCurrentBranch =
        currentBranch !== null &&
        selectedItem !== null &&
        currentBranch.name === selectedItem.branch.name
      if (!isCurrentBranch) {
        return
      }
    }

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(
        selectedItem ? selectedItem.branch : null,
        source
      )
    }
  }

  private onCreateNewBranch = () => {
    if (this.props.onCreateNewBranch) {
      this.props.onCreateNewBranch(this.props.filterText)
    }
  }
}
