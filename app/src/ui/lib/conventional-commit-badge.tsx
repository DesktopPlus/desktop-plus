import * as React from 'react'
import { IConventionalCommit } from '../../lib/conventional-commits'

interface IConventionalCommitBadgeProps {
  readonly parsed: IConventionalCommit
}

export class ConventionalCommitBadge extends React.PureComponent<IConventionalCommitBadgeProps> {
  public render() {
    const { rawType, label, scope } = this.props.parsed

    return (
      <>
        <span className="conventional-commit-badge" data-cc-type={rawType}>
          {label}
        </span>
        {scope !== null && (
          <span className="conventional-commit-scope">{scope}</span>
        )}
      </>
    )
  }
}
