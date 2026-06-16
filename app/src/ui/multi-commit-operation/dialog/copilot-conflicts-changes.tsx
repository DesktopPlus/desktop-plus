import * as React from 'react'
import { WorkingDirectoryFileChange } from '../../../models/status'
import { IFileResolution } from '../../../lib/copilot-conflict-resolution'

interface ICopilotConflictsChangesProps {
  readonly conflictedFiles: ReadonlyArray<WorkingDirectoryFileChange>
  readonly copilotResolutions: ReadonlyArray<IFileResolution> | null
}

/**
 * Placeholder component for the Changes tab in the Copilot conflicts dialog.
 *
 * A future PR will replace this skeleton with a full diff viewer showing
 * Copilot's conflict resolutions inline.
 */
export class CopilotConflictsChanges extends React.Component<ICopilotConflictsChangesProps> {
  public render() {
    const { conflictedFiles, copilotResolutions } = this.props
    const resolvedCount = copilotResolutions?.length ?? 0

    return (
      <div className="copilot-changes-tab">
        <p className="copilot-changes-placeholder">
          Changes preview coming soon — {conflictedFiles.length} file
          {conflictedFiles.length === 1 ? '' : 's'}, {resolvedCount} resolved by
          Copilot
        </p>
      </div>
    )
  }
}
