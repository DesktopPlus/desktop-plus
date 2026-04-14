import * as React from 'react'

import { Tooltip, TooltipDirection } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IWholeFileToggleProps {
  readonly enabled: boolean
  readonly showWholeFile: boolean
  readonly onShowWholeFileChanged: (showWholeFile: boolean) => void
}

export class WholeFileToggle extends React.Component<IWholeFileToggleProps> {
  private buttonRef = createObservableRef<HTMLButtonElement>()

  private onClick = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()

    if (!this.props.enabled && !this.props.showWholeFile) {
      return
    }

    this.props.onShowWholeFileChanged(!this.props.showWholeFile)
  }

  public render() {
    const { enabled, showWholeFile } = this.props
    const buttonLabel = showWholeFile
      ? __DARWIN__
        ? 'Show Compact Diff'
        : 'Show compact diff'
      : __DARWIN__
        ? 'Show Whole File'
        : 'Show whole file'

    return (
      <div className="diff-whole-file-toggle-component">
        <button
          aria-label={buttonLabel}
          aria-pressed={showWholeFile}
          disabled={!enabled && !showWholeFile}
          onClick={this.onClick}
          ref={this.buttonRef}
          type="button"
        >
          <Tooltip
            target={this.buttonRef}
            direction={TooltipDirection.NORTH}
            applyAriaDescribedBy={false}
            disabled={!enabled && !showWholeFile}
          >
            {buttonLabel}
          </Tooltip>
          <Octicon symbol={showWholeFile ? octicons.fold : octicons.unfold} />
        </button>
      </div>
    )
  }
}
