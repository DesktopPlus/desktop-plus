import * as React from 'react'

import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Repositoryish } from './group-repositories'
import { WorktreeEntry } from '../../models/worktree'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAheadBehind } from '../../models/branch'
import classNames from 'classnames'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { TooltippedContent } from '../lib/tooltipped-content'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** The repository or worktree name to display in the list. */
  readonly title: string

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The characters in the repository name to highlight */
  readonly matches: IMatches

  /** Number of commits this local repo branch is behind or ahead of its remote branch */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes */
  readonly changedFilesCount: number

  /** The name of the current branch, if it should be displayed */
  readonly branchName: string | null

  /** Parent path to show when duplicate worktree names need visible disambiguation. */
  readonly worktreePathDisambiguation: string | null

  /** Whether this row is rendered nested below a main worktree row. */
  readonly isNestedWorktree: boolean

  /** Whether this row represents a stale worktree entry that Git can prune. */
  readonly isPrunableWorktree: boolean

  /**
   * When set to a linked worktree, this row renders as a worktree nested below
   * its repository instead of as the repository itself.
   */
  readonly worktree: WorktreeEntry | null
}

/** Renders the branch name badge shown next to a repository or worktree. */
function renderBranchNameBadge(branchName: string | null) {
  if (!branchName) {
    return null
  }

  return (
    <span className="branch-name">
      <Octicon className="branch-icon" symbol={octicons.gitBranch} />
      {branchName}
    </span>
  )
}

function renderWorktreePathDisambiguation(path: string | null) {
  if (!path) {
    return null
  }

  return <span className="worktree-path-disambiguation">{path}</span>
}

/** A repository item. */
export class RepositoryListItem extends React.Component<
  IRepositoryListItemProps,
  {}
> {
  private readonly listItemRef = createObservableRef<HTMLDivElement>()

  public render() {
    const { isNestedWorktree, worktree } = this.props
    return isNestedWorktree && worktree !== null && worktree.type === 'linked'
      ? this.renderWorktree(worktree)
      : this.renderRepository()
  }

  private renderRepository() {
    const repository = this.props.repository
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const hasChanges = this.props.changedFilesCount > 0

    const alias: string | null =
      repository instanceof Repository ? repository.alias : null

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    const classNameList = classNames('name', {
      alias: alias !== null && this.props.title === alias,
    })

    return (
      <div className="repository-list-item" ref={this.listItemRef}>
        <Tooltip
          target={this.listItemRef}
          disabled={enableAccessibleListToolTips()}
        >
          {this.renderTooltip()}
        </Tooltip>

        <Octicon
          className="icon-for-repository"
          symbol={iconForRepository(repository)}
        />

        <div className={classNames(classNameList)}>
          {prefix ? <span className="prefix">{prefix}</span> : null}
          <HighlightText
            text={this.props.title}
            highlight={this.props.matches.title}
          />
        </div>

        {renderBranchNameBadge(this.props.branchName)}
        {renderWorktreePathDisambiguation(
          this.props.worktreePathDisambiguation
        )}
        {this.props.isPrunableWorktree && renderPrunableIndicator()}

        {repository instanceof Repository &&
          renderRepoIndicators({
            aheadBehind: this.props.aheadBehind,
            hasChanges: hasChanges,
          })}
      </div>
    )
  }

  private renderWorktree(worktree: WorktreeEntry) {
    return (
      <div
        className="repository-list-item repository-worktree-item"
        ref={this.listItemRef}
      >
        <Tooltip
          target={this.listItemRef}
          disabled={enableAccessibleListToolTips()}
        >
          {this.renderWorktreeTooltip(worktree)}
        </Tooltip>

        <Octicon
          className="icon-for-repository"
          symbol={octicons.fileDirectory}
        />

        <div className="name">
          <HighlightText
            text={this.props.title}
            highlight={this.props.matches.title}
          />
        </div>

        {renderBranchNameBadge(this.props.branchName)}
        {renderWorktreePathDisambiguation(
          this.props.worktreePathDisambiguation
        )}
        {this.props.isPrunableWorktree && renderPrunableIndicator()}

        {renderRepoIndicators({
          aheadBehind: this.props.aheadBehind,
          hasChanges: this.props.changedFilesCount > 0,
        })}
      </div>
    )
  }

  private renderTooltip() {
    const repo = this.props.repository
    const gitHubRepo = repo instanceof Repository ? repo.gitHubRepository : null
    const alias = repo instanceof Repository ? repo.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repo.name
    const path = this.props.worktree?.path ?? repo.path

    return (
      <>
        <div>
          <strong>{realName}</strong>
          {alias && <> ({alias})</>}
        </div>
        <div>{path}</div>
        {this.props.branchName && <div>Branch: {this.props.branchName}</div>}
        {this.props.isPrunableWorktree && (
          <div>This worktree entry is stale and should be pruned.</div>
        )}
      </>
    )
  }

  private renderWorktreeTooltip(worktree: WorktreeEntry) {
    return (
      <>
        <div>{worktree.path}</div>
        {this.props.branchName && <div>Branch: {this.props.branchName}</div>}
        {this.props.isPrunableWorktree && (
          <div>This worktree entry is stale and should be pruned.</div>
        )}
      </>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.id !== this.props.repository.id ||
        nextProps.title !== this.props.title ||
        nextProps.matches !== this.props.matches ||
        nextProps.branchName !== this.props.branchName ||
        nextProps.worktreePathDisambiguation !==
          this.props.worktreePathDisambiguation ||
        nextProps.needsDisambiguation !== this.props.needsDisambiguation ||
        nextProps.aheadBehind !== this.props.aheadBehind ||
        nextProps.changedFilesCount !== this.props.changedFilesCount ||
        nextProps.isNestedWorktree !== this.props.isNestedWorktree ||
        nextProps.isPrunableWorktree !== this.props.isPrunableWorktree ||
        nextProps.worktree !== this.props.worktree
      )
    } else {
      return true
    }
  }
}

const renderRepoIndicators: React.FunctionComponent<{
  aheadBehind: IAheadBehind | null
  hasChanges: boolean
}> = props => {
  return (
    <div className="repo-indicators">
      {props.aheadBehind && renderAheadBehindIndicator(props.aheadBehind)}
      {props.hasChanges && renderChangesIndicator()}
    </div>
  )
}

const renderAheadBehindIndicator = (aheadBehind: IAheadBehind) => {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0) {
    return null
  }

  const aheadBehindTooltip =
    'The currently checked out branch is' +
    (behind ? ` ${commitGrammar(behind)} behind ` : '') +
    (behind && ahead ? 'and' : '') +
    (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
    'its tracked branch.'

  return (
    <TooltippedContent
      className="ahead-behind"
      tagName="div"
      tooltip={aheadBehindTooltip}
      disabled={enableAccessibleListToolTips()}
    >
      {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
      {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
    </TooltippedContent>
  )
}

const renderChangesIndicator = () => {
  return (
    <TooltippedContent
      className="change-indicator-wrapper"
      tooltip="There are uncommitted changes in this repository"
      disabled={enableAccessibleListToolTips()}
    >
      <Octicon symbol={octicons.dotFill} />
    </TooltippedContent>
  )
}

const renderPrunableIndicator = () => {
  return (
    <TooltippedContent
      className="prunable-indicator-wrapper"
      tooltip="This worktree entry is stale and should be pruned"
      disabled={enableAccessibleListToolTips()}
    >
      <Octicon symbol={octicons.alert} />
    </TooltippedContent>
  )
}

export const commitGrammar = (commitNum: number) =>
  `${commitNum} commit${commitNum > 1 ? 's' : ''}` // english is hard
