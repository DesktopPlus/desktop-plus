import * as React from 'react'

import { commitGrammar, RepositoryListItem } from './repository-list-item'
import {
  groupRepositories,
  IRepositoryListItem,
  Repositoryish,
  RepositoryListGroup,
  getGroupKey,
} from './group-repositories'
import { IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { ILocalRepositoryState, Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon, syncClockwise } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu } from '../../lib/menu-item'
import { IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import { encodePathAsUrl } from '../../lib/path'
import { TooltippedContent } from '../lib/tooltipped-content'
import memoizeOne from 'memoize-one'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { generateRepositoryListContextMenu } from '../repositories-list/repository-list-item-context-menu'
import { SectionFilterList } from '../lib/section-filter-list'
import { assertNever } from '../../lib/fatal-error'
import { IAheadBehind } from '../../models/branch'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { normalizePath } from '../../lib/helpers/path'
import { ClickSource } from '../lib/list'
import { FoldoutType } from '../../lib/app-state'
import { pruneWorktrees } from '../../lib/git/worktree'
import { getEditorOverrideLabel } from '../../models/editor-override'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly showRecentRepositories: boolean
  readonly recentRepositories: ReadonlyArray<number>

  /** A cache of the latest repository state values, keyed by the repository id */
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >

  /** Called when a repository has been selected. */
  readonly onSelectionChanged: (repository: Repositoryish) => void

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish) => void

  /** Called when the repository should be opened in the default web browser. */
  readonly onViewInBrowser: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in a new window. */
  readonly onOpenInNewWindow: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** The label for the user's preferred shell. */
  readonly shellLabel?: string

  /** The callback to fire when the filter text has changed */
  readonly onFilterTextChanged: (text: string) => void

  /** The text entered by the user to filter their repository list */
  readonly filterText: string

  readonly dispatcher: Dispatcher

  /** Controls when to show the branch name next to each repository */
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  readonly showWorktreesInSidebar: boolean
}

interface IRepositoriesListState {
  readonly newRepositoryMenuExpanded: boolean
  readonly pullingRepositories: boolean
  readonly selectedItem: IRepositoryListItem | null
}

const RowHeight = 29

/**
 * Iterate over all groups until a list item is found that matches
 * the id of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >,
  selectedRepository: Repositoryish | null
) {
  if (selectedRepository !== null) {
    const selectedPath = normalizePath(selectedRepository.path)
    for (const group of groups) {
      for (const item of group.items) {
        if (
          item.repository.id === selectedRepository.id ||
          (item.worktreePath !== null &&
            normalizePath(item.worktreePath) === selectedPath)
        ) {
          return item
        }
      }
    }
  }

  return null
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  IRepositoriesListState
> {
  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish> | null,
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
      recentRepositories: ReadonlyArray<number>,
      showWorktreesInSidebar: boolean
    ) =>
      repositories === null
        ? []
        : groupRepositories(
            repositories,
            localRepositoryStateLookup,
            recentRepositories,
            { showWorktreesInSidebar }
          )
  )

  /**
   * A memoized function for finding the selected list item based
   * on an IAPIRepository instance. The selected item will not be
   * recomputed as long as the provided list of repositories and
   * the selected data object is equal to the last time the method
   * was called (reference equality).
   *
   * See findMatchingListItem for more details.
   */
  private getSelectedListItem = memoizeOne(findMatchingListItem)

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = {
      newRepositoryMenuExpanded: false,
      pullingRepositories: false,
      selectedItem: null,
    }
  }

  private shouldShowBranchName(item: IRepositoryListItem): boolean {
    const { showBranchNameInRepoList } = this.props
    switch (showBranchNameInRepoList) {
      case ShowBranchNameInRepoListSetting.Never:
        return false
      case ShowBranchNameInRepoListSetting.Always:
        return true
      case ShowBranchNameInRepoListSetting.WhenNotDefault:
        return item.branchName !== item.defaultBranchName
      default:
        assertNever(
          showBranchNameInRepoList,
          `Unknown show branch name setting: ${showBranchNameInRepoList}`
        )
    }
  }

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={item.id}
        title={item.title}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
        branchName={this.shouldShowBranchName(item) ? item.branchName : null}
        isNestedWorktree={item.isNestedWorktree}
        mainWorktreeName={item.mainWorktreeName}
        isPrunableWorktree={item.isPrunableWorktree}
      />
    )
  }

  private getAheadBehindTooltip = (aheadBehind: IAheadBehind | null) => {
    if (aheadBehind === null) {
      return null
    }

    const { ahead, behind } = aheadBehind

    if (behind === 0 && ahead === 0) {
      return null
    }

    return (
      'The currently checked out branch is' +
      (behind ? ` ${commitGrammar(behind)} behind ` : '') +
      (behind && ahead ? 'and' : '') +
      (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
      'its tracked branch.'
    )
  }

  private renderRowFocusTooltip = (
    item: IRepositoryListItem
  ): JSX.Element | string | null => {
    const { repository, aheadBehind, changedFilesCount } = item
    const branchName = this.shouldShowBranchName(item) ? item.branchName : null
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const alias = repository instanceof Repository ? repository.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repository.name
    const aheadBehindTooltip = this.getAheadBehindTooltip(aheadBehind)
    const hasChanges = changedFilesCount > 0
    const uncommittedChangesTooltip = hasChanges
      ? `There are uncommitted changes in this repository.`
      : null
    const prunableWorktreeTooltip = item.isPrunableWorktree
      ? 'This worktree entry is stale and should be pruned.'
      : null

    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0

    return (
      <div className="repository-list-item-tooltip list-item-tooltip">
        <div>
          <div className="label">Full Name: </div>
          {realName}
          {alias && <> ({alias})</>}
        </div>
        <div>
          <div className="label">Path: </div>
          {repository.path}
        </div>
        {branchName && (
          <div>
            <div className="label">Branch: </div>
            {branchName}
          </div>
        )}
        {aheadBehindTooltip && (
          <div>
            <div className="label">
              <div className="ahead-behind">
                {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
                {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
              </div>
            </div>
            {aheadBehindTooltip}
          </div>
        )}
        {uncommittedChangesTooltip && (
          <div>
            <div className="label">
              <span className="change-indicator-wrapper">
                <Octicon symbol={octicons.dotFill} />
              </span>
            </div>
            {uncommittedChangesTooltip}
          </div>
        )}
        {prunableWorktreeTooltip && (
          <div>
            <div className="label">
              <span className="prunable-indicator-wrapper">
                <Octicon symbol={octicons.alert} />
              </span>
            </div>
            {prunableWorktreeTooltip}
          </div>
        )}
      </div>
    )
  }

  private getGroupLabel(group: RepositoryListGroup) {
    const { kind, displayName } = group
    if (kind === 'enterprise') {
      return displayName ?? group.host
    } else if (kind === 'other') {
      return displayName ?? 'Other'
    } else if (kind === 'dotcom') {
      const accountLoginSuffix =
        group.login && group.login !== group.owner.login
          ? ` (${group.login})`
          : ''
      const defaultLabel = group.owner.login + accountLoginSuffix
      return displayName ?? defaultLabel
    } else if (kind === 'recent') {
      return 'Recent'
    } else {
      assertNever(kind, `Unknown repository group kind ${kind}`)
    }
  }

  private renderGroupHeader = (group: RepositoryListGroup) => {
    const label = this.getGroupLabel(group)

    return (
      <TooltippedContent
        key={getGroupKey(group)}
        className="filter-list-group-header"
        tooltip={label}
        onlyWhenOverflowed={true}
        tagName="div"
      >
        {label}
      </TooltippedContent>
    )
  }

  private onItemClick = (item: IRepositoryListItem, source: ClickSource) => {
    if (
      source.kind === 'mouseclick' &&
      (source.event.button === 2 ||
        (__DARWIN__ && source.event.button === 0 && source.event.ctrlKey))
    ) {
      return
    }

    if (item.isPrunableWorktree) {
      void this.props.dispatcher.postError(
        new Error(
          'This worktree entry is stale. Use the context menu to prune stale worktrees.'
        )
      )
      return
    }

    if (item.isVirtualLinkedWorktree && item.worktreePath !== null) {
      void this.onVirtualWorktreeClick(item).catch(error =>
        this.props.dispatcher.postError(error)
      )
      return
    }

    const hasIndicator =
      item.changedFilesCount > 0 ||
      (item.aheadBehind !== null
        ? item.aheadBehind.ahead > 0 || item.aheadBehind.behind > 0
        : false)
    this.props.dispatcher.recordRepoClicked(hasIndicator)
    this.props.onSelectionChanged(item.repository)
  }

  private onVirtualWorktreeClick = async (item: IRepositoryListItem) => {
    if (
      item.worktreePath === null ||
      item.sourceRepository === null ||
      !(item.repository instanceof Repository)
    ) {
      return
    }

    const { worktreePath } = item
    const existingRepo = this.props.repositories.find(
      r =>
        r instanceof Repository &&
        normalizePath(r.path) === normalizePath(worktreePath)
    )

    if (existingRepo instanceof Repository) {
      await this.props.dispatcher.selectRepository(existingRepo)
      await this.props.dispatcher.closeFoldout(FoldoutType.Repository)
      return
    }

    const addedRepos = await this.props.dispatcher.addRepositories(
      [worktreePath],
      item.sourceRepository.login
    )
    if (addedRepos.length > 0) {
      await this.props.dispatcher.selectRepository(addedRepos[0])
      await this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private onRemoveLinkedWorktree = (item: IRepositoryListItem) => {
    const worktreePath =
      item.worktreePath ??
      (item.repository instanceof Repository ? item.repository.path : null)
    if (worktreePath === null) {
      return
    }

    const repository =
      item.isVirtualLinkedWorktree && item.sourceRepository !== null
        ? item.sourceRepository
        : item.repository instanceof Repository
        ? item.repository
        : null
    const storedRepositoryToRemove =
      item.repository instanceof Repository && !item.isVirtualLinkedWorktree
        ? item.repository
        : null

    if (repository === null) {
      return
    }

    if (item.changedFilesCount > 0) {
      this.props.dispatcher.showPopup({
        type: PopupType.CantDeleteWorktreeUncommittedChanges,
        worktreePath,
      })
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.DeleteWorktree,
      repository,
      worktreePath,
      storedRepositoryToRemove,
      isDeletingCurrentWorktree:
        this.props.selectedRepository !== null &&
        normalizePath(this.props.selectedRepository.path) ===
          normalizePath(worktreePath),
    })
  }

  private onPruneStaleWorktrees = async (item: IRepositoryListItem) => {
    const repository =
      item.sourceRepository ??
      (item.repository instanceof Repository ? item.repository : null)

    if (repository === null) {
      return
    }

    try {
      await pruneWorktrees(repository)
      await this.props.dispatcher.refreshRepository(repository)
    } catch (error) {
      this.props.dispatcher.postError(error)
    }
  }

  private onItemContextMenu = (
    item: IRepositoryListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const items = generateRepositoryListContextMenu({
      onRemoveRepository: this.props.onRemoveRepository,
      onRemoveLinkedWorktree: () => this.onRemoveLinkedWorktree(item),
      onShowRepository: this.props.onShowRepository,
      onOpenInNewWindow: this.props.onOpenInNewWindow,
      onOpenInShell: this.props.onOpenInShell,
      onOpenInExternalEditor: this.props.onOpenInExternalEditor,
      askForConfirmationOnRemoveRepository:
        this.props.askForConfirmationOnRemoveRepository,
      showWorktreesInSidebar: this.props.showWorktreesInSidebar,
      isLinkedWorktreeRow:
        item.isVirtualLinkedWorktree ||
        (item.repository instanceof Repository &&
          item.repository.isLinkedWorktree),
      isVirtualLinkedWorktreeRow: item.isVirtualLinkedWorktree,
      isPrunableWorktreeRow: item.isPrunableWorktree,
      externalEditorLabel: this.getExternalEditorLabel(item.repository),
      onAddNewWorktree: this.onAddNewWorktree,
      onRenameWorktree: this.onRenameWorktree,
      onChangeRepositoryAlias: this.onChangeRepositoryAlias,
      onRemoveRepositoryAlias: this.onRemoveRepositoryAlias,
      onChangeRepositoryGroupName: this.onChangeRepositoryGroupName,
      onRemoveRepositoryGroupName: this.onRemoveRepositoryGroupName,
      onViewInBrowser: this.props.onViewInBrowser,
      repository: item.repository,
      shellLabel: this.props.shellLabel,
      onCopyRepoPath: path => this.props.dispatcher.copyPathToClipboard(path),
      onPruneStaleWorktrees: () => {
        this.onPruneStaleWorktrees(item)
      },
    })

    showContextualMenu(items)
  }

  private getItemAriaLabel = (item: IRepositoryListItem) => item.repository.name
  private getGroupAriaLabelGetter =
    (
      groups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >
    ) =>
    (group: number) =>
      this.getGroupLabel(groups[group].identifier)

  public render() {
    let groups = this.getRepositoryGroups(
      this.props.repositories,
      this.props.localRepositoryStateLookup,
      this.props.recentRepositories,
      this.props.showWorktreesInSidebar
    )

    if (!this.props.showRecentRepositories) {
      groups = groups.filter(group => group.identifier.kind !== 'recent')
    }

    if (!this.props.showRecentRepositories) {
      groups = groups.filter(group => group.identifier.kind !== 'recent')
    }

    // So there's two types of selection at play here. There's the repository
    // selection for the whole app and then there's the keyboard selection in
    // the list itself. If the user has selected a repository using keyboard
    // navigation we want to honor that selection. If the user hasn't selected a
    // repository yet we'll select the repository currently selected in the app.
    const selectedItem =
      this.state.selectedItem ??
      this.getSelectedListItem(groups, this.props.selectedRepository)

    return (
      <div className="repository-list">
        <SectionFilterList<IRepositoryListItem, RepositoryListGroup>
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          renderItem={this.renderItem}
          renderRowFocusTooltip={this.renderRowFocusTooltip}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          groups={groups}
          invalidationProps={{
            repositories: this.props.repositories,
            filterText: this.props.filterText,
          }}
          onItemContextMenu={this.onItemContextMenu}
          getGroupAriaLabel={this.getGroupAriaLabelGetter(groups)}
          getItemAriaLabel={this.getItemAriaLabel}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }

  private getExternalEditorLabel(
    repository: Repositoryish
  ): string | undefined {
    if (repository instanceof Repository && repository.customEditorOverride) {
      return getEditorOverrideLabel(repository.customEditorOverride)
    }
    return this.props.externalEditorLabel
  }

  private onSelectionChanged = (selectedItem: IRepositoryListItem | null) => {
    this.setState({ selectedItem })
  }

  private renderPostFilter = () => {
    return (
      <>
        <Button
          className="repo-list-button new-repository button-with-icon"
          onClick={this.onNewRepositoryButtonClick}
          ariaExpanded={this.state.newRepositoryMenuExpanded}
          onKeyDown={this.onNewRepositoryButtonKeyDown}
        >
          Add
          <Octicon symbol={octicons.triangleDown} />
        </Button>

        {this.state.pullingRepositories ? (
          <Button
            className="repo-list-button pull-repositories-spin button-with-icon"
            disabled={true}
          >
            <Octicon symbol={syncClockwise} className="spin" />
            Pulling…
          </Button>
        ) : (
          <Button
            className="repo-list-button pull-repositories button-with-icon"
            onClick={this.onPullRepositoriesButtonClick}
          >
            <Octicon symbol={octicons.arrowDown} />
            {__DARWIN__ ? 'Pull All' : 'Pull all'}
          </Button>
        )}
      </>
    )
  }

  private onNewRepositoryButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === 'ArrowDown') {
      this.onNewRepositoryButtonClick()
    }
  }

  private renderNoItems = () => {
    return (
      <div className="no-items no-results-found">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div className="title">Sorry, I can't find that repository</div>

        <div className="protip">
          ProTip! Press{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut darwinKeys={['⌘', 'O']} keys={['Ctrl', 'O']} />
          </div>{' '}
          to quickly add a local repository, and{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut
              darwinKeys={['⇧', '⌘', 'O']}
              keys={['Ctrl', 'Shift', 'O']}
            />
          </div>{' '}
          to clone from anywhere within the app
        </div>
      </div>
    )
  }

  private onNewRepositoryButtonClick = () => {
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clone repository…',
        action: this.onCloneRepository,
      },
      {
        label: __DARWIN__ ? 'Create New Repository…' : 'Create new repository…',
        action: this.onCreateNewRepository,
      },
      {
        label: __DARWIN__
          ? 'Add Existing Repository…'
          : 'Add existing repository…',
        action: this.onAddExistingRepository,
      },
    ]

    this.setState({ newRepositoryMenuExpanded: true })
    showContextualMenu(items).then(() => {
      this.setState({ newRepositoryMenuExpanded: false })
    })
  }

  private onPullRepositoriesButtonClick = async () => {
    this.setState({ pullingRepositories: true })
    await this.props.dispatcher.pullAllRepositories()
    this.setState({ pullingRepositories: false })
  }

  private onCloneRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL: null,
    })
  }

  private onAddExistingRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.CreateRepository })
  }

  private onAddNewWorktree = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository,
    })
  }

  private onRenameWorktree = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.RenameWorktree,
      repository,
      worktreePath: repository.path,
    })
  }

  private onChangeRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryAlias,
      repository,
    })
  }

  private onRemoveRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryAlias(repository, null)
  }

  private onChangeRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryGroupName,
      repository,
    })
  }

  private onRemoveRepositoryGroupName = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryGroupName(repository, null)
  }
}
