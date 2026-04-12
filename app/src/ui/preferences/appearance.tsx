import * as React from 'react'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
  getCurrentlyAppliedTheme,
} from '../lib/application-theme'
import { TitleBarStyle } from '../lib/title-bar-style'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'
import { RadioGroup } from '../lib/radio-group'
import { Select } from '../lib/select'
import { TextBox } from '../lib/text-box'
import { encodePathAsUrl } from '../../lib/path'
import { tabSizeDefault } from '../../lib/stores/app-store'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { ShowBranchNameInRepoListSetting } from '../../models/show-branch-name-in-repo-list'
import { parseEnumValue } from '../../lib/enum'
import { assertNever } from '../../lib/fatal-error'
import { BranchSortOrder } from '../../models/branch-sort-order'
import { CommitDateDisplay } from '../../models/commit-date-display'
import {
  clampDiffFontSize,
  defaultDiffFontLigatures,
  defaultDiffFontSize,
  defaultDiffFontWeight,
  normalizeDiffFontFamily,
  normalizeDiffFontLigatures,
  normalizeDiffFontWeight,
} from '../../models/diff-font'

interface IAppearanceProps {
  readonly selectedTheme: ApplicationTheme
  readonly onSelectedThemeChanged: (theme: ApplicationTheme) => void
  readonly selectedTabSize: number
  readonly onSelectedTabSizeChanged: (tabSize: number) => void
  readonly selectedDiffFontSize: number
  readonly onSelectedDiffFontSizeChanged: (diffFontSize: number) => void
  readonly selectedDiffFontFamily: string
  readonly onSelectedDiffFontFamilyChanged: (diffFontFamily: string) => void
  readonly selectedDiffFontWeight: string
  readonly onSelectedDiffFontWeightChanged: (diffFontWeight: string) => void
  readonly selectedDiffFontLigatures: string
  readonly onSelectedDiffFontLigaturesChanged: (
    diffFontLigatures: string
  ) => void
  readonly titleBarStyle: TitleBarStyle
  readonly onTitleBarStyleChanged: (titleBarStyle: TitleBarStyle) => void
  readonly showRecentRepositories: boolean
  readonly onShowRecentRepositoriesChanged: (show: boolean) => void
  readonly showWorktrees: boolean
  readonly onShowWorktreesChanged: (show: boolean) => void
  readonly showWorktreesInSidebar: boolean
  readonly onShowWorktreesInSidebarChanged: (show: boolean) => void
  readonly showCompareTab: boolean
  readonly onShowCompareTabChanged: (show: boolean) => void
  readonly showBranchNameInRepoList: ShowBranchNameInRepoListSetting
  readonly onShowBranchNameInRepoListChanged: (
    value: ShowBranchNameInRepoListSetting
  ) => void
  readonly branchSortOrder: BranchSortOrder
  readonly onBranchSortOrderChanged: (sortOrder: BranchSortOrder) => void
  readonly commitDateDisplay: CommitDateDisplay
  readonly onCommitDateDisplayChanged: (value: CommitDateDisplay) => void
}

interface IAppearanceState {
  readonly selectedTheme: ApplicationTheme | null
  readonly selectedTabSize: number
  readonly selectedDiffFontSize: string
  readonly selectedDiffFontFamily: string
  readonly selectedDiffFontWeight: string
  readonly selectedDiffFontLigatures: string
  readonly titleBarStyle: TitleBarStyle
  readonly showRecentRepositories: boolean
  readonly showWorktrees: boolean
  readonly showWorktreesInSidebar: boolean
  readonly showCompareTab: boolean
}

function getTitleBarStyleDescription(titleBarStyle: TitleBarStyle): string {
  switch (titleBarStyle) {
    case 'custom':
      return 'Uses the menu system provided by GitHub Desktop, hiding the default chrome provided by your window manager.'
    case 'native':
      return 'Uses the menu system and chrome provided by your window manager.'
  }
}

export class Appearance extends React.Component<
  IAppearanceProps,
  IAppearanceState
> {
  public constructor(props: IAppearanceProps) {
    super(props)

    const usePropTheme =
      props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    this.state = {
      selectedTheme: usePropTheme ? props.selectedTheme : null,
      selectedTabSize: props.selectedTabSize,
      selectedDiffFontSize: props.selectedDiffFontSize.toString(),
      selectedDiffFontFamily: props.selectedDiffFontFamily,
      selectedDiffFontWeight: props.selectedDiffFontWeight,
      selectedDiffFontLigatures: props.selectedDiffFontLigatures,
      titleBarStyle: props.titleBarStyle,
      showRecentRepositories: props.showRecentRepositories,
      showWorktrees: props.showWorktrees,
      showWorktreesInSidebar: props.showWorktreesInSidebar,
      showCompareTab: props.showCompareTab,
    }

    if (!usePropTheme) {
      this.initializeSelectedTheme()
    }
  }

  public async componentDidUpdate(prevProps: IAppearanceProps) {
    if (
      prevProps.selectedTheme === this.props.selectedTheme &&
      prevProps.selectedTabSize === this.props.selectedTabSize &&
      prevProps.selectedDiffFontSize === this.props.selectedDiffFontSize &&
      prevProps.selectedDiffFontFamily === this.props.selectedDiffFontFamily &&
      prevProps.selectedDiffFontWeight === this.props.selectedDiffFontWeight &&
      prevProps.selectedDiffFontLigatures ===
        this.props.selectedDiffFontLigatures &&
      prevProps.showWorktrees === this.props.showWorktrees &&
      prevProps.showWorktreesInSidebar === this.props.showWorktreesInSidebar &&
      prevProps.showCompareTab === this.props.showCompareTab
    ) {
      return
    }

    const usePropTheme =
      this.props.selectedTheme !== ApplicationTheme.System ||
      supportsSystemThemeChanges()

    const selectedTheme = usePropTheme
      ? this.props.selectedTheme
      : await getCurrentlyAppliedTheme()

    const selectedTabSize = this.props.selectedTabSize
    const selectedDiffFontSize = this.props.selectedDiffFontSize.toString()
    const selectedDiffFontFamily = this.props.selectedDiffFontFamily
    const selectedDiffFontWeight = this.props.selectedDiffFontWeight
    const selectedDiffFontLigatures = this.props.selectedDiffFontLigatures

    this.setState({
      selectedTheme,
      selectedTabSize,
      selectedDiffFontSize,
      selectedDiffFontFamily,
      selectedDiffFontWeight,
      selectedDiffFontLigatures,
      showWorktrees: this.props.showWorktrees,
      showWorktreesInSidebar: this.props.showWorktreesInSidebar,
      showCompareTab: this.props.showCompareTab,
    })
  }

  private initializeSelectedTheme = async () => {
    const selectedTheme = await getCurrentlyAppliedTheme()
    const selectedTabSize = this.props.selectedTabSize
    this.setState({
      selectedTheme,
      selectedTabSize,
      selectedDiffFontSize: this.props.selectedDiffFontSize.toString(),
      selectedDiffFontFamily: this.props.selectedDiffFontFamily,
      selectedDiffFontWeight: this.props.selectedDiffFontWeight,
      selectedDiffFontLigatures: this.props.selectedDiffFontLigatures,
    })
  }

  private onSelectedThemeChanged = (theme: ApplicationTheme) => {
    this.props.onSelectedThemeChanged(theme)
  }

  private onShowRecentRepositoriesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const show = event.currentTarget.checked
    this.setState({ showRecentRepositories: show })
    this.props.onShowRecentRepositoriesChanged(show)
  }

  private onShowWorktreesChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const show = event.currentTarget.checked
    this.setState({ showWorktrees: show })
    this.props.onShowWorktreesChanged(show)
  }

  private onShowCompareTabChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const show = event.currentTarget.checked
    this.setState({ showCompareTab: show })
    this.props.onShowCompareTabChanged(show)
  }

  private onShowWorktreesInSidebarChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const show = event.currentTarget.checked
    this.setState({ showWorktreesInSidebar: show })
    this.props.onShowWorktreesInSidebarChanged(show)
  }

  private onSelectedTabSizeChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedTabSizeChanged(parseInt(event.currentTarget.value))
  }

  private onSelectedDiffFontSizeChanged = (value: string) => {
    this.setState({ selectedDiffFontSize: value })
  }

  private commitSelectedDiffFontSize = (value: string) => {
    const diffFontSize = clampDiffFontSize(parseInt(value, 10))
    this.setState({ selectedDiffFontSize: diffFontSize.toString() })
    this.props.onSelectedDiffFontSizeChanged(diffFontSize)
  }

  private onSelectedDiffFontFamilyChanged = (value: string) => {
    this.setState({ selectedDiffFontFamily: value })
  }

  private commitSelectedDiffFontFamily = (value: string) => {
    const diffFontFamily = normalizeDiffFontFamily(value)
    this.setState({ selectedDiffFontFamily: diffFontFamily })
    this.props.onSelectedDiffFontFamilyChanged(diffFontFamily)
  }

  private onSelectedDiffFontWeightChanged = (value: string) => {
    this.setState({ selectedDiffFontWeight: value })
  }

  private commitSelectedDiffFontWeight = (value: string) => {
    const diffFontWeight =
      value.trim().length === 0 ? '' : normalizeDiffFontWeight(value)
    this.setState({ selectedDiffFontWeight: diffFontWeight })
    this.props.onSelectedDiffFontWeightChanged(diffFontWeight)
  }

  private onSelectedDiffFontLigaturesChanged = (value: string) => {
    this.setState({ selectedDiffFontLigatures: value })
  }

  private commitSelectedDiffFontLigatures = (value: string) => {
    const diffFontLigatures =
      value.trim().length === 0 ? '' : normalizeDiffFontLigatures(value)
    this.setState({ selectedDiffFontLigatures: diffFontLigatures })
    this.props.onSelectedDiffFontLigaturesChanged(diffFontLigatures)
  }

  private onSelectChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const titleBarStyle = event.currentTarget.value as TitleBarStyle
    this.setState({ titleBarStyle })
    this.props.onTitleBarStyleChanged(titleBarStyle)
  }

  public renderThemeSwatch = (theme: ApplicationTheme) => {
    const darkThemeImage = encodePathAsUrl(__dirname, 'static/ghd_dark.svg')
    const lightThemeImage = encodePathAsUrl(__dirname, 'static/ghd_light.svg')

    switch (theme) {
      case ApplicationTheme.Light:
        return (
          <span>
            <img src={lightThemeImage} alt="" />
            <span className="theme-value-label">Light</span>
          </span>
        )
      case ApplicationTheme.Dark:
        return (
          <span>
            <img src={darkThemeImage} alt="" />
            <span className="theme-value-label">Dark</span>
          </span>
        )
      case ApplicationTheme.System:
        /** Why three images? The system theme swatch uses the first image
         * positioned relatively to get the label container size and uses the
         * second and third positioned absolutely over first and third one
         * clipped in half to render a split dark and light theme swatch. */
        return (
          <span>
            <span className="system-theme-swatch">
              <img src={lightThemeImage} alt="" />
              <img src={lightThemeImage} alt="" />
              <img src={darkThemeImage} alt="" />
            </span>
            <span className="theme-value-label">System</span>
          </span>
        )
    }
  }

  private renderTitleBarStyleDropdown() {
    const { titleBarStyle } = this.state
    const titleBarStyleDescription = getTitleBarStyleDescription(titleBarStyle)

    return (
      <div className="advanced-section">
        <h2>Title bar style</h2>

        <Select
          value={this.state.titleBarStyle}
          onChange={this.onSelectChanged}
        >
          <option value="native">Native</option>
          <option value="custom">Custom</option>
        </Select>

        <div className="git-settings-description">
          {titleBarStyleDescription}
        </div>
      </div>
    )
  }

  private renderSelectedTheme() {
    const { selectedTheme } = this.state

    if (selectedTheme == null) {
      return <Row>Loading system theme</Row>
    }

    const themes = [
      ApplicationTheme.Light,
      ApplicationTheme.Dark,
      ...(supportsSystemThemeChanges() ? [ApplicationTheme.System] : []),
    ]

    return (
      <div className="advanced-section">
        <h2 id="theme-heading">Theme</h2>
        <Row>
          <RadioGroup<ApplicationTheme>
            ariaLabelledBy="theme-heading"
            className="theme-selector"
            selectedKey={selectedTheme}
            radioButtonKeys={themes}
            onSelectionChanged={this.onSelectedThemeChanged}
            renderRadioButtonLabelContents={this.renderThemeSwatch}
          />
        </Row>
      </div>
    )
  }

  private onShowBranchNameInRepoListChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = parseEnumValue(
      ShowBranchNameInRepoListSetting,
      event.currentTarget.value
    )
    if (value !== undefined) {
      this.props.onShowBranchNameInRepoListChanged(value)
    }
  }

  private onBranchSortOrderChanged = (branchSortOrder: BranchSortOrder) => {
    this.props.onBranchSortOrderChanged(branchSortOrder)
  }

  private renderBranchSortOrder() {
    const { branchSortOrder } = this.props

    return (
      <div className="advanced-section">
        <h2 id="branch-sort-order-heading">Sort branches</h2>

        <RadioGroup<BranchSortOrder>
          ariaLabelledBy="branch-sort-order-heading"
          selectedKey={branchSortOrder}
          radioButtonKeys={[
            BranchSortOrder.Alphabetical,
            BranchSortOrder.LastModified,
          ]}
          onSelectionChanged={this.onBranchSortOrderChanged}
          renderRadioButtonLabelContents={this.renderBranchSortOptionLabel}
        />
      </div>
    )
  }

  private renderBranchSortOptionLabel = (branchSortOrder: BranchSortOrder) => {
    switch (branchSortOrder) {
      case BranchSortOrder.Alphabetical:
        return 'Alphabetical'
      case BranchSortOrder.LastModified:
        return 'Last modified'
      default:
        return assertNever(
          branchSortOrder,
          `Unknown branch sort order: ${branchSortOrder}`
        )
    }
  }

  private renderCommitDateDisplay() {
    const { commitDateDisplay } = this.props

    return (
      <div className="advanced-section">
        <h2 id="commit-date-display-heading">Commit date display</h2>

        <RadioGroup<CommitDateDisplay>
          ariaLabelledBy="commit-date-display-heading"
          selectedKey={commitDateDisplay}
          radioButtonKeys={[
            CommitDateDisplay.Relative,
            CommitDateDisplay.Absolute,
          ]}
          onSelectionChanged={this.props.onCommitDateDisplayChanged}
          renderRadioButtonLabelContents={this.renderCommitDateDisplayLabel}
        />
      </div>
    )
  }

  private renderCommitDateDisplayLabel = (value: CommitDateDisplay) => {
    switch (value) {
      case CommitDateDisplay.Relative:
        return 'Relative (e.g. "3 days ago")'
      case CommitDateDisplay.Absolute:
        return 'Absolute (e.g. "Mar 14, 2026, 2:34 PM")'
      default:
        return assertNever(value, `Unknown commit date display: ${value}`)
    }
  }

  private renderRepositoryList() {
    return (
      <div className="advanced-section">
        <h2 id="repository-list-heading">{'Repository list'}</h2>

        <Checkbox
          label="Show recent repositories"
          value={
            this.state.showRecentRepositories
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onShowRecentRepositoriesChanged}
        />
        <Select
          label="Show current branch name next to repository name"
          value={this.props.showBranchNameInRepoList}
          onChange={this.onShowBranchNameInRepoListChanged}
        >
          <option value={ShowBranchNameInRepoListSetting.Never}>Never</option>
          <option value={ShowBranchNameInRepoListSetting.Always}>Always</option>
          <option value={ShowBranchNameInRepoListSetting.WhenNotDefault}>
            When it's not the default branch
          </option>
        </Select>
      </div>
    )
  }

  private renderWorktreeVisibility() {
    return (
      <>
        <div className="advanced-section">
          <h2 id="worktree-heading">{'Worktrees'}</h2>

          <Checkbox
            label="Show worktrees dropdown in toolbar"
            value={
              this.state.showWorktrees ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onShowWorktreesChanged}
          />
          <Checkbox
            label="Show worktrees in repository sidebar"
            value={
              this.state.showWorktreesInSidebar
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onShowWorktreesInSidebarChanged}
          />
        </div>
        <div className="advanced-section">
          <h2>{'Commit list'}</h2>

          <Checkbox
            label="Show Compare tab"
            value={
              this.state.showCompareTab ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onShowCompareTabChanged}
          />
        </div>
      </>
    )
  }

  private renderDiffSettings() {
    const availableTabSizes: number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12]

    return (
      <div className="advanced-section">
        <h2 id="diff-heading">{'Diff'}</h2>

        <TextBox
          label={__DARWIN__ ? 'Font Size' : 'Font size'}
          value={this.state.selectedDiffFontSize}
          placeholder={defaultDiffFontSize.toString()}
          onValueChanged={this.onSelectedDiffFontSizeChanged}
          onBlur={this.commitSelectedDiffFontSize}
          onEnterPressed={this.commitSelectedDiffFontSize}
        />

        <TextBox
          value={this.state.selectedDiffFontFamily}
          label="Font"
          placeholder="Default monospace stack"
          onValueChanged={this.onSelectedDiffFontFamilyChanged}
          onBlur={this.commitSelectedDiffFontFamily}
          onEnterPressed={this.commitSelectedDiffFontFamily}
        />

        <TextBox
          value={this.state.selectedDiffFontWeight}
          label={__DARWIN__ ? 'Font Weight' : 'Font weight'}
          placeholder={`${defaultDiffFontWeight}`}
          onValueChanged={this.onSelectedDiffFontWeightChanged}
          onBlur={this.commitSelectedDiffFontWeight}
          onEnterPressed={this.commitSelectedDiffFontWeight}
        />

        <TextBox
          value={this.state.selectedDiffFontLigatures}
          label={__DARWIN__ ? 'Font Ligatures' : 'Font ligatures'}
          placeholder={`${defaultDiffFontLigatures}`}
          onValueChanged={this.onSelectedDiffFontLigaturesChanged}
          onBlur={this.commitSelectedDiffFontLigatures}
          onEnterPressed={this.commitSelectedDiffFontLigatures}
        />

        <Select
          value={this.state.selectedTabSize.toString()}
          label={__DARWIN__ ? 'Tab Size' : 'Tab size'}
          onChange={this.onSelectedTabSizeChanged}
        >
          {availableTabSizes.map(n => (
            <option key={n} value={n}>
              {n === tabSizeDefault ? `${n} (default)` : n}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  public render() {
    return (
      <DialogContent className="appearance-tab">
        {this.renderSelectedTheme()}
        {this.renderRepositoryList()}
        {this.renderBranchSortOrder()}
        {this.renderCommitDateDisplay()}
        {this.renderWorktreeVisibility()}
        {this.renderDiffSettings()}
        {this.renderTitleBarStyleDropdown()}
      </DialogContent>
    )
  }
}
