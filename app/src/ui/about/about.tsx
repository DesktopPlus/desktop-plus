import * as React from 'react'

import { Row } from '../lib/row'
import {
  Dialog,
  DialogError,
  DialogContent,
  DefaultDialogFooter,
} from '../dialog'
import { LinkButton } from '../lib/link-button'
import { IUpdateState, UpdateStatus } from '../lib/update-store'
import { Loading } from '../lib/loading'
import { RelativeTime } from '../relative-time'
import { assertNever } from '../../lib/fatal-error'
import {
  DesktopPlusReleaseNotesUri,
  UpstreamReleaseNotesUri,
} from '../lib/releases'
import { encodePathAsUrl } from '../../lib/path'
import { isOSNoLongerSupportedByElectron } from '../../lib/get-os'
import { AriaLiveContainer } from '../accessibility/aria-live-container'
import { formatDate } from '../../lib/format-date'

const logoPath = __DARWIN__
  ? 'static/logo-64x64@2x.png'
  : 'static/windows-logo-64x64@2x.png'
const DesktopLogo = encodePathAsUrl(__dirname, logoPath)

interface IAboutProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissible prop.
   */
  readonly onDismissed: () => void

  /**
   * The name of the currently installed (and running) application
   */
  readonly applicationName: string

  /**
   * The currently installed (and running) version of the app.
   */
  readonly applicationVersion: string

  /**
   * The currently installed (and running) architecture of the app.
   */
  readonly applicationArchitecture: string

  readonly onShowAcknowledgements: () => void

  /** A function to call when the user wants to see Terms and Conditions. */
  readonly onShowTermsAndConditions: () => void

  readonly updateState: IUpdateState

  /**
   * A flag to indicate whether the About dialog should ignore that
   * it's running in development mode. Used exclusively by the AboutTestDialog
   */
  readonly allowDevelopment?: boolean
}

interface IUpdateInfoProps {
  readonly message: string
  readonly richMessage?: JSX.Element
  readonly loading?: boolean
}

class UpdateInfo extends React.Component<IUpdateInfoProps> {
  public render() {
    return (
      <div className="update-status">
        <AriaLiveContainer message={this.props.message} />

        {this.props.loading && <Loading />}
        {this.props.richMessage ?? this.props.message}
      </div>
    )
  }
}

/**
 * A dialog that presents information about the
 * running application such as name and version.
 */
export class About extends React.Component<IAboutProps> {
  private get canCheckForUpdates() {
    return (
      __RELEASE_CHANNEL__ !== 'development' ||
      this.props.allowDevelopment === true
    )
  }

  private renderUpdateButton() {
    return (
      <Row>
        <p className="no-padding">
          <LinkButton uri={DesktopPlusReleaseNotesUri}>
            GitHub Desktop Plus Releases
          </LinkButton>
          <span className="separator">|</span>
          <LinkButton uri={UpstreamReleaseNotesUri}>
            Upstream Releases
          </LinkButton>
        </p>
      </Row>
    )
  }

  private renderUpdateDetails() {
    if (__LINUX__) {
      return (
        <p>
          Please visit the GitHub Desktop Plus release page for release notes
          and to download the latest version.
        </p>
      )
    }

    if (!this.canCheckForUpdates) {
      return (
        <p>
          The application is currently running in development and will not
          receive any updates.
        </p>
      )
    }

    const { status, lastSuccessfulCheck } = this.props.updateState

    switch (status) {
      case UpdateStatus.CheckingForUpdates:
        return <UpdateInfo message="Checking for updates…" loading={true} />
      case UpdateStatus.UpdateAvailable:
        return <UpdateInfo message="Downloading update…" loading={true} />
      case UpdateStatus.UpdateNotAvailable:
        if (!lastSuccessfulCheck) {
          return null
        }

        const richMessage = (
          <p>
            You have the latest version (last checked{' '}
            <RelativeTime date={lastSuccessfulCheck} />)
          </p>
        )

        const absoluteDate = formatDate(lastSuccessfulCheck, {
          dateStyle: 'full',
          timeStyle: 'short',
        })

        return (
          <UpdateInfo
            message={`You have the latest version (last checked ${absoluteDate})`}
            richMessage={richMessage}
          />
        )
      case UpdateStatus.UpdateReady:
        return (
          <UpdateInfo message="An update has been downloaded and is ready to be installed." />
        )
      case UpdateStatus.UpdateNotChecked:
        return null
      default:
        return assertNever(status, `Unknown update status ${status}`)
    }
  }

  private renderUpdateErrors() {
    if (__LINUX__) {
      return null
    }

    if (!this.canCheckForUpdates) {
      return null
    }

    if (isOSNoLongerSupportedByElectron()) {
      return (
        <DialogError>
          This operating system is no longer supported. Software updates have
          been disabled.{' '}
          <LinkButton uri="https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/supported-operating-systems">
            Supported operating systems
          </LinkButton>
        </DialogError>
      )
    }

    return null
  }

  private renderBetaLink() {
    return
  }

  public render() {
    const name = this.props.applicationName
    const version = this.props.applicationVersion
    const releaseNotesLink = (
      <LinkButton uri={DesktopPlusReleaseNotesUri}>release notes</LinkButton>
    )

    const versionText = __DEV__ ? `Build ${version}` : `Version ${version}`
    const titleId = 'Dialog_about'

    return (
      <Dialog
        id="about"
        titleId={titleId}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        {this.renderUpdateErrors()}
        <DialogContent>
          <Row className="logo">
            <img
              src={DesktopLogo}
              alt="GitHub Desktop Plus"
              width="64"
              height="64"
            />
          </Row>
          <h1 id={titleId}>About {name}</h1>
          <p className="no-padding">
            <span className="selectable-text">
              {versionText} ({this.props.applicationArchitecture})
            </span>{' '}
            ({releaseNotesLink})
          </p>
          {this.renderUpdateDetails()}
          {this.renderUpdateButton()}
          {this.renderBetaLink()}
          <div className="terms-and-license-container">
            <p className="no-padding terms-and-license">
              <LinkButton onClick={this.props.onShowTermsAndConditions}>
                Terms and Conditions
              </LinkButton>
            </p>
            <p className="no-padding terms-and-license">
              <LinkButton onClick={this.props.onShowAcknowledgements}>
                License and Open Source Notices
              </LinkButton>
            </p>
            <p className="terms-and-license">
              <LinkButton uri="https://gh.io/copilot-for-desktop-transparency">
                Responsible use of Copilot in GitHub Desktop
              </LinkButton>
            </p>
          </div>
        </DialogContent>
        <DefaultDialogFooter />
      </Dialog>
    )
  }
}
