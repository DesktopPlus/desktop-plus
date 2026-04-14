import * as React from 'react'

import { DiffRowType, SimplifiedDiffRow } from './diff-helpers'

interface IDiffMinimapProps {
  readonly rows: ReadonlyArray<SimplifiedDiffRow>
  readonly showSideBySideDiff: boolean
  readonly getScrollableNode: () => HTMLElement | null
  readonly onScrollToPosition: (scrollTop: number) => void
}

interface IViewportMetrics {
  readonly top: number
  readonly height: number
  readonly maxScrollTop: number
}

interface IScrollMetrics {
  readonly trackHeight: number
  readonly clientHeight: number
  readonly scrollHeight: number
  readonly scrollTop: number
  readonly maxScrollTop: number
}

interface IVisibleRowBounds {
  readonly start: number
  readonly end: number
}

interface IViewportGeometry {
  readonly top: number
  readonly height: number
}

interface IRowGeometry {
  readonly top: number
  readonly height: number
}

interface IMergedChangeRun {
  readonly row: SimplifiedDiffRow
  readonly startIndex: number
  readonly geometry: IRowGeometry
  readonly endIndex: number
}

interface IViewportRenderState {
  readonly visible: boolean
  readonly top: number
  readonly height: number
}

interface ILineMetrics {
  readonly leadingWidth: number
  readonly trimmedLength: number
}

interface ILineBarLayout {
  readonly startX: number
  readonly primaryWidth: number
  readonly trailingX: number | null
  readonly trailingWidth: number
}

interface IMinimapPalette {
  readonly background: string
  readonly border: string
  readonly context: string
  readonly added: string
  readonly deleted: string
  readonly hunk: string
  readonly addedBackground: string
  readonly deletedBackground: string
  readonly hunkBackground: string
}

interface IRGBColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

const MinViewportHeight = 28
const MinimapPadding = 6
const MinimapColumnGap = 4
const MinimapLanePadding = 1
const KeyboardScrollStep = 48
const MinimapContentSelector = '.ReactVirtualized__Grid__innerScrollContainer'
const MinChangedRowHeight = 2
const MinHunkRowHeight = 2
const MinMergedChangeRunRows = 2
const MaxContextBarHeight = 4
const MaxChangedBarHeight = 10
const MinimapChangeColorBrightnessDark = 0.3
const MinimapChangeColorBrightnessLight = 0.0

interface IMinimapLane {
  readonly x: number
  readonly width: number
}

interface IMinimapLanes {
  readonly before: IMinimapLane
  readonly after: IMinimapLane
  readonly gapWidth: number
}

export class DiffMinimap extends React.PureComponent<IDiffMinimapProps> {
  private readonly containerRef = React.createRef<HTMLButtonElement>()
  private readonly canvasRef = React.createRef<HTMLCanvasElement>()
  private readonly viewportRef = React.createRef<HTMLDivElement>()

  private wheelListenerTarget: HTMLButtonElement | null = null
  private scrollContainer: HTMLElement | null = null
  private contentContainer: HTMLElement | null = null
  private themeObserver: MutationObserver | null = null
  private lastThemeClassName = ''
  private resizeObserver: ResizeObserver | null = null
  private frameHandle: number | null = null
  private dragScrollFrameHandle: number | null = null
  private wheelScrollFrameHandle: number | null = null
  private needsRedraw = false
  private needsViewportUpdate = false
  private dragOffset = 0
  private dragContainerTop = 0
  private dragViewport: IViewportGeometry | null = null
  private pendingDragTrackTop: number | null = null
  private pendingWheelDelta = 0
  private viewportRenderState: IViewportRenderState | null = null
  private readonly lineMetricsCache = new Map<string, ILineMetrics>()

  public componentDidMount() {
    this.syncWheelListener()
    this.syncScrollContainer()
    this.resetThemeObserver()
    this.resetResizeObserver()
    this.scheduleRedraw()
  }

  public componentDidUpdate(prevProps: IDiffMinimapProps) {
    this.syncWheelListener()
    this.syncScrollContainer()

    if (
      prevProps.rows !== this.props.rows ||
      prevProps.showSideBySideDiff !== this.props.showSideBySideDiff
    ) {
      if (prevProps.rows !== this.props.rows) {
        this.lineMetricsCache.clear()
      }
      this.resetResizeObserver()
      this.scheduleRedraw()
    } else {
      this.scheduleViewportUpdate()
    }
  }

  public componentWillUnmount() {
    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }

    if (this.dragScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.dragScrollFrameHandle)
      this.dragScrollFrameHandle = null
    }

    if (this.wheelScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.wheelScrollFrameHandle)
      this.wheelScrollFrameHandle = null
    }

    this.detachWheelListener()
    this.detachScrollContainer()
    this.disconnectThemeObserver()
    this.disconnectResizeObserver()
    this.resetDragState()
    this.removeDragListeners()
  }

  public render() {
    return (
      <button
        ref={this.containerRef}
        type="button"
        className="diff-minimap"
        aria-label="Diff minimap"
        title="Diff minimap"
        onMouseDown={this.onMouseDown}
        onKeyDown={this.onKeyDown}
      >
        <canvas ref={this.canvasRef} aria-hidden={true} />
        <div
          ref={this.viewportRef}
          className="diff-minimap-viewport"
          aria-hidden={true}
        />
      </button>
    )
  }

  private syncScrollContainer() {
    const nextContainer = this.props.getScrollableNode()
    if (nextContainer === this.scrollContainer) {
      return
    }

    this.detachScrollContainer()
    this.scrollContainer = nextContainer
    this.contentContainer = null
    this.viewportRenderState = null

    this.scrollContainer?.addEventListener('scroll', this.onScroll, {
      passive: true,
    })

    this.resetResizeObserver()
    this.scheduleRedraw()
  }

  private syncWheelListener() {
    const container = this.containerRef.current
    if (container === this.wheelListenerTarget) {
      return
    }

    this.detachWheelListener()

    if (container !== null) {
      // React's wheel listeners are passive in Chromium, but the minimap
      // intentionally cancels the browser default and drives the diff scroll.
      container.addEventListener('wheel', this.onWheel, { passive: false })
      this.wheelListenerTarget = container
    }
  }

  private detachWheelListener() {
    this.wheelListenerTarget?.removeEventListener('wheel', this.onWheel)
    this.wheelListenerTarget = null
  }

  private detachScrollContainer() {
    this.scrollContainer?.removeEventListener('scroll', this.onScroll)
    this.scrollContainer = null
    this.contentContainer = null
  }

  private resetResizeObserver() {
    this.disconnectResizeObserver()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.onResize)
      return
    }

    const observer = new ResizeObserver(this.onResize)

    this.observeNode(observer, this.containerRef.current)
    this.observeNode(observer, this.scrollContainer)
    this.observeNode(observer, this.getContentContainerNode())

    this.resizeObserver = observer
  }

  private resetThemeObserver() {
    this.disconnectThemeObserver()

    if (typeof MutationObserver === 'undefined') {
      return
    }

    this.lastThemeClassName = this.getThemeClassName()
    this.themeObserver = new MutationObserver(this.onBodyClassChanged)
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }

  private disconnectResizeObserver() {
    window.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  private disconnectThemeObserver() {
    this.themeObserver?.disconnect()
    this.themeObserver = null
  }

  private observeNode(observer: ResizeObserver, node: Element | null) {
    if (node !== null) {
      observer.observe(node)
    }
  }

  private onResize = () => {
    this.viewportRenderState = null
    this.scheduleRedraw()
  }

  private onScroll = () => {
    this.scheduleViewportUpdate()
  }

  private onBodyClassChanged = () => {
    const nextThemeClassName = this.getThemeClassName()
    if (nextThemeClassName === this.lastThemeClassName) {
      return
    }

    this.lastThemeClassName = nextThemeClassName
    this.viewportRenderState = null
    this.scheduleRedraw()
  }

  private getThemeClassName() {
    const themeClass = [...document.body.classList].find(c =>
      c.startsWith('theme-')
    )

    return themeClass ?? ''
  }

  private scheduleRedraw() {
    this.needsRedraw = true
    this.needsViewportUpdate = true
    this.scheduleFrame()
  }

  private scheduleViewportUpdate() {
    this.needsViewportUpdate = true
    this.scheduleFrame()
  }

  private scheduleFrame() {
    if (this.frameHandle !== null) {
      return
    }

    this.frameHandle = window.requestAnimationFrame(() => {
      this.frameHandle = null

      if (this.needsRedraw) {
        this.needsRedraw = false
        this.redrawCanvas()
      }

      if (this.needsViewportUpdate) {
        this.needsViewportUpdate = false
        this.updateViewport()
      }
    })
  }

  private redrawCanvas() {
    const canvas = this.canvasRef.current
    const container = this.containerRef.current
    if (canvas === null || container === null) {
      return
    }

    const width = Math.max(1, Math.floor(container.clientWidth))
    const height = Math.max(1, Math.floor(container.clientHeight))
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const palette = this.getPalette(container)
    const rows = this.props.rows

    context.clearRect(0, 0, width, height)
    context.fillStyle = palette.background
    context.fillRect(0, 0, width, height)

    if (rows.length === 0) {
      context.fillStyle = palette.border
      context.fillRect(0, 0, 1, height)
      return
    }

    const contentHeight = this.getContentHeight(height)
    const lanes = this.getLanes(width)
    const pixelsPerRow = contentHeight / rows.length
    const rowGeometries = new Array<IRowGeometry>(rows.length)

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const top = Math.floor(index * pixelsPerRow)
      const bottom = Math.max(
        top + 1,
        Math.ceil((index + 1) * pixelsPerRow)
      )
      const rowHeight = Math.max(1, bottom - top)
      rowGeometries[index] = this.getRowGeometry(
        row,
        top,
        rowHeight,
        contentHeight
      )
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const mergedRun = this.getMergedChangeRun(rows, rowGeometries, index)

      if (mergedRun !== null) {
        this.drawMergedChangeRun(
          context,
          rows,
          rowGeometries,
          mergedRun.row,
          palette,
          mergedRun.geometry,
          mergedRun.startIndex,
          mergedRun.endIndex,
          width,
          lanes
        )
        index = mergedRun.endIndex
        continue
      }

      this.drawRow(
        context,
        row,
        palette,
        rowGeometries[index],
        width,
        lanes
      )
    }

    if (this.props.showSideBySideDiff && lanes.gapWidth > 0) {
      const separatorX =
        lanes.before.x + lanes.before.width + Math.floor(lanes.gapWidth / 2)
      context.globalAlpha = 0.45
      context.fillStyle = palette.border
      context.fillRect(separatorX, 0, 1, contentHeight)
      context.globalAlpha = 1
    }

    context.fillStyle = palette.border
    context.fillRect(0, 0, 1, height)
  }

  private getContentContainerNode() {
    if (
      this.contentContainer !== null &&
      this.contentContainer.isConnected &&
      this.contentContainer.parentElement !== null
    ) {
      return this.contentContainer
    }

    this.contentContainer = this.scrollContainer?.querySelector(
      MinimapContentSelector
    ) as HTMLElement | null

    return this.contentContainer
  }

  /**
   * Queries the rendered children of the virtualized list to determine
   * which parts of the row index space are currently visible in the
   * scroll container.
   *
   * This is more accurate than deriving visibility from scroll metrics
   * because react-virtualized uses estimated heights for unmeasured rows,
   * causing scrollHeight to change as rows are scrolled into view.
   *
   * The returned bounds are fractional row indices so the viewport can move
   * smoothly while still staying aligned to the minimap's uniform row layout.
   */
  private getVisibleRowBounds(): IVisibleRowBounds | null {
    const contentContainer = this.getContentContainerNode()
    const scrollContainer = this.scrollContainer

    if (contentContainer === null || scrollContainer === null) {
      return null
    }

    const { scrollTop, clientHeight } = scrollContainer
    const scrollBottom = scrollTop + clientHeight
    const children = contentContainer.children

    const start = this.getVisibleRowBound(
      children,
      scrollTop,
      scrollBottom,
      true
    )
    if (start === null) {
      return null
    }

    const end = this.getVisibleRowBound(
      children,
      scrollTop,
      scrollBottom,
      false
    )

    return end !== null && end > start ? { start, end } : null
  }

  private getVisibleRowBound(
    children: HTMLCollection,
    scrollTop: number,
    scrollBottom: number,
    fromStart: boolean
  ): number | null {
    const childCount = children.length
    const step = fromStart ? 1 : -1
    let i = fromStart ? 0 : childCount - 1

    while (i >= 0 && i < childCount) {
      const el = children[i] as HTMLElement
      const rowHeight = el.offsetHeight
      if (rowHeight > 0) {
        const top = el.offsetTop
        const bottom = top + rowHeight

        if (fromStart ? top >= scrollBottom : bottom <= scrollTop) {
          break
        }

        if (fromStart ? bottom > scrollTop : top < scrollBottom) {
          // Each rendered row wrapper carries the diff row index in
          // aria-rowindex, which lets the minimap map measured DOM rows back to
          // the full logical row space without depending on child order alone.
          const index = Number(el.getAttribute('aria-rowindex'))
          if (!Number.isNaN(index)) {
            const visibleOffset = fromStart
              ? Math.max(0, scrollTop - top)
              : Math.min(rowHeight, scrollBottom - top)
            return index + visibleOffset / rowHeight
          }
        }
      }

      i += step
    }

    return null
  }

  private getContentHeight(trackHeight: number): number {
    const scrollContainer = this.scrollContainer

    if (scrollContainer === null) {
      return trackHeight
    }

    const visibleHeight = scrollContainer.clientHeight
    const contentHeight =
      this.getContentContainerNode()?.getBoundingClientRect().height ??
      scrollContainer.scrollHeight

    if (trackHeight === 0 || visibleHeight === 0 || contentHeight === 0) {
      return trackHeight
    }

    const scaledHeight = Math.round(
      trackHeight * Math.min(1, contentHeight / visibleHeight)
    )

    return Math.max(1, Math.min(trackHeight, scaledHeight))
  }

  private getLanes(width: number): IMinimapLanes {
    const innerX = MinimapPadding
    const innerWidth = Math.max(8, width - MinimapPadding * 2)

    if (!this.props.showSideBySideDiff) {
      return {
        before: { x: innerX, width: innerWidth },
        after: { x: innerX, width: innerWidth },
        gapWidth: 0,
      }
    }

    const gapWidth = Math.min(
      MinimapColumnGap,
      Math.max(2, innerWidth - 4)
    )
    const beforeWidth = Math.max(2, Math.floor((innerWidth - gapWidth) / 2))
    const afterWidth = Math.max(2, innerWidth - gapWidth - beforeWidth)

    return {
      before: { x: innerX, width: beforeWidth },
      after: { x: innerX + beforeWidth + gapWidth, width: afterWidth },
      gapWidth,
    }
  }

  private drawRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    width: number,
    lanes: IMinimapLanes
  ) {
    if (this.props.showSideBySideDiff) {
      this.drawSplitRow(context, row, palette, geometry, lanes)
    } else {
      this.drawUnifiedRow(context, row, palette, geometry, width, lanes)
    }

    context.globalAlpha = 1
  }

  private drawUnifiedRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    width: number,
    lanes: IMinimapLanes
  ) {
    const { top, height: rowHeight } = geometry

    switch (row.type) {
      case DiffRowType.Hunk:
        context.globalAlpha = 0.75
        context.fillStyle = palette.hunkBackground
        context.fillRect(0, top, width, rowHeight)
        context.globalAlpha = 0.55
        context.fillStyle = palette.hunk
        context.fillRect(
          lanes.before.x,
          top,
          Math.max(2, lanes.before.width),
          Math.max(1, rowHeight)
        )
        return

      case DiffRowType.Context:
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.before,
          0.28,
          false
        )
        return

      case DiffRowType.Added:
        context.globalAlpha = 0.26
        context.fillStyle = palette.addedBackground
        context.fillRect(0, top, width, rowHeight)
        this.drawLineBars(
          context,
          row.data.content,
          palette.added,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Deleted:
        context.globalAlpha = 0.26
        context.fillStyle = palette.deletedBackground
        context.fillRect(0, top, width, rowHeight)
        this.drawLineBars(
          context,
          row.data.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Modified: {
        const topHeight = Math.max(1, Math.ceil(rowHeight / 2))
        const bottomHeight = Math.max(1, Math.floor(rowHeight / 2))
        const bottomTop = top + rowHeight - bottomHeight

        context.globalAlpha = 0.16
        context.fillStyle = palette.deletedBackground
        context.fillRect(0, top, width, topHeight)
        context.fillStyle = palette.addedBackground
        context.fillRect(0, bottomTop, width, bottomHeight)

        this.drawLineBars(
          context,
          row.beforeData.content,
          palette.deleted,
          top,
          topHeight,
          lanes.before,
          0.72,
          true
        )
        this.drawLineBars(
          context,
          row.afterData.content,
          palette.added,
          bottomTop,
          bottomHeight,
          lanes.before,
          0.72,
          true
        )
        return
      }
    }
  }

  private drawSplitRow(
    context: CanvasRenderingContext2D,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    lanes: IMinimapLanes
  ) {
    const { top, height: rowHeight } = geometry

    switch (row.type) {
      case DiffRowType.Hunk: {
        const width = lanes.after.x + lanes.after.width - lanes.before.x
        context.globalAlpha = 0.75
        context.fillStyle = palette.hunkBackground
        context.fillRect(lanes.before.x, top, width, rowHeight)
        context.globalAlpha = 0.55
        context.fillStyle = palette.hunk
        context.fillRect(lanes.before.x, top, width, Math.max(1, rowHeight))
        return
      }

      case DiffRowType.Context:
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.before,
          0.22,
          false
        )
        this.drawLineBars(
          context,
          row.content,
          palette.context,
          top,
          rowHeight,
          lanes.after,
          0.22,
          false
        )
        return

      case DiffRowType.Added:
        context.globalAlpha = 0.26
        context.fillStyle = palette.addedBackground
        context.fillRect(
          lanes.after.x,
          top,
          lanes.after.width,
          Math.max(1, rowHeight)
        )
        this.drawLineBars(
          context,
          row.data.content,
          palette.added,
          top,
          rowHeight,
          lanes.after,
          0.75,
          true
        )
        return

      case DiffRowType.Deleted:
        context.globalAlpha = 0.26
        context.fillStyle = palette.deletedBackground
        context.fillRect(
          lanes.before.x,
          top,
          lanes.before.width,
          Math.max(1, rowHeight)
        )
        this.drawLineBars(
          context,
          row.data.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.75,
          true
        )
        return

      case DiffRowType.Modified:
        context.globalAlpha = 0.18
        context.fillStyle = palette.deletedBackground
        context.fillRect(
          lanes.before.x,
          top,
          lanes.before.width,
          Math.max(1, rowHeight)
        )
        context.fillStyle = palette.addedBackground
        context.fillRect(
          lanes.after.x,
          top,
          lanes.after.width,
          Math.max(1, rowHeight)
        )

        this.drawLineBars(
          context,
          row.beforeData.content,
          palette.deleted,
          top,
          rowHeight,
          lanes.before,
          0.72,
          true
        )
        this.drawLineBars(
          context,
          row.afterData.content,
          palette.added,
          top,
          rowHeight,
          lanes.after,
          0.72,
          true
        )
        return
    }
  }

  private drawLineBars(
    context: CanvasRenderingContext2D,
    content: string,
    color: string,
    top: number,
    rowHeight: number,
    lane: IMinimapLane,
    alpha: number,
    emphasize: boolean
  ) {
    const layout = this.getLineBarLayout(content, lane)
    const barHeight = this.getLineBarHeight(rowHeight, emphasize)
    const y = top + Math.max(0, Math.floor((rowHeight - barHeight) / 2))

    context.globalAlpha = alpha
    context.fillStyle = color
    context.fillRect(layout.startX, y, layout.primaryWidth, barHeight)

    if (layout.trailingX !== null && layout.trailingWidth > 0) {
      context.globalAlpha = alpha * 0.6
      context.fillRect(
        layout.trailingX,
        y,
        layout.trailingWidth,
        barHeight
      )
    }
  }

  private getMergedChangeRun(
    rows: ReadonlyArray<SimplifiedDiffRow>,
    rowGeometries: ReadonlyArray<IRowGeometry>,
    startIndex: number
  ): IMergedChangeRun | null {
    const row = rows[startIndex]
    if (!this.canMergeChangeRun(row)) {
      return null
    }

    let endIndex = startIndex
    while (
      endIndex + 1 < rows.length &&
      rows[endIndex + 1].type === row.type
    ) {
      endIndex++
    }

    if (endIndex - startIndex + 1 < MinMergedChangeRunRows) {
      return null
    }

    const startGeometry = rowGeometries[startIndex]
    const endGeometry = rowGeometries[endIndex]

    return {
      row,
      startIndex,
      endIndex,
      geometry: {
        top: startGeometry.top,
        height: Math.max(
          1,
          endGeometry.top + endGeometry.height - startGeometry.top
        ),
      },
    }
  }

  private canMergeChangeRun(row: SimplifiedDiffRow) {
    return row.type === DiffRowType.Added || row.type === DiffRowType.Deleted
  }

  private drawMergedChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    rowGeometries: ReadonlyArray<IRowGeometry>,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    startIndex: number,
    endIndex: number,
    width: number,
    lanes: IMinimapLanes
  ) {
    if (this.props.showSideBySideDiff) {
      this.drawMergedSplitChangeRun(
        context,
        rows,
        rowGeometries,
        row,
        palette,
        geometry,
        startIndex,
        endIndex,
        lanes
      )
    } else {
      this.drawMergedUnifiedChangeRun(
        context,
        rows,
        rowGeometries,
        row,
        palette,
        geometry,
        startIndex,
        endIndex,
        width,
        lanes
      )
    }

    context.globalAlpha = 1
  }

  private drawMergedUnifiedChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    rowGeometries: ReadonlyArray<IRowGeometry>,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    startIndex: number,
    endIndex: number,
    width: number,
    lanes: IMinimapLanes
  ) {
    if (row.type !== DiffRowType.Added && row.type !== DiffRowType.Deleted) {
      this.drawRow(context, row, palette, geometry, width, lanes)
      return
    }

    context.globalAlpha = 0.34
    context.fillStyle =
      row.type === DiffRowType.Added
        ? palette.addedBackground
        : palette.deletedBackground
    context.fillRect(0, geometry.top, width, Math.max(1, geometry.height))

    this.drawMergedLineSlices(
      context,
      rows,
      rowGeometries,
      startIndex,
      endIndex,
      lanes.before,
      row.type === DiffRowType.Added ? palette.added : palette.deleted
    )
  }

  private drawMergedSplitChangeRun(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    rowGeometries: ReadonlyArray<IRowGeometry>,
    row: SimplifiedDiffRow,
    palette: IMinimapPalette,
    geometry: IRowGeometry,
    startIndex: number,
    endIndex: number,
    lanes: IMinimapLanes
  ) {
    if (row.type === DiffRowType.Added) {
      this.drawMergedLaneBackground(
        context,
        lanes.after,
        geometry,
        palette.addedBackground
      )
      this.drawMergedLineSlices(
        context,
        rows,
        rowGeometries,
        startIndex,
        endIndex,
        lanes.after,
        palette.added
      )
      return
    }

    if (row.type === DiffRowType.Deleted) {
      this.drawMergedLaneBackground(
        context,
        lanes.before,
        geometry,
        palette.deletedBackground
      )
      this.drawMergedLineSlices(
        context,
        rows,
        rowGeometries,
        startIndex,
        endIndex,
        lanes.before,
        palette.deleted
      )
    }
  }

  private drawMergedLaneBackground(
    context: CanvasRenderingContext2D,
    lane: IMinimapLane,
    geometry: IRowGeometry,
    backgroundColor: string
  ) {
    context.globalAlpha = 0.34
    context.fillStyle = backgroundColor
    context.fillRect(
      lane.x,
      geometry.top,
      Math.max(2, lane.width),
      Math.max(1, geometry.height)
    )
  }

  private drawMergedLineSlices(
    context: CanvasRenderingContext2D,
    rows: ReadonlyArray<SimplifiedDiffRow>,
    rowGeometries: ReadonlyArray<IRowGeometry>,
    startIndex: number,
    endIndex: number,
    lane: IMinimapLane,
    color: string
  ) {
    context.fillStyle = color

    for (let index = startIndex; index <= endIndex; index++) {
      const content = this.getMergedRunRowContent(rows[index])
      if (content === null) {
        continue
      }

      const geometry = rowGeometries[index]
      const layout = this.getLineBarLayout(content, lane, true)
      const sliceHeight = Math.max(1, geometry.height)

      context.globalAlpha = 0.82
      context.fillRect(
        layout.startX,
        geometry.top,
        layout.primaryWidth,
        sliceHeight
      )

      if (layout.trailingX !== null && layout.trailingWidth > 0) {
        context.globalAlpha = 0.5
        context.fillRect(
          layout.trailingX,
          geometry.top,
          layout.trailingWidth,
          sliceHeight
        )
      }
    }
  }

  private getMergedRunRowContent(row: SimplifiedDiffRow) {
    switch (row.type) {
      case DiffRowType.Added:
      case DiffRowType.Deleted:
        return row.data.content
      default:
        return null
    }
  }

  private getLineBarLayout(
    content: string,
    lane: IMinimapLane,
    compactEmpty = false
  ): ILineBarLayout {
    const { leadingWidth, trimmedLength } = this.getLineMetrics(content)
    const innerWidth = Math.max(2, lane.width - MinimapLanePadding * 2)
    const indentRatio = Math.min(0.55, leadingWidth / 48)
    const startX = Math.round(
      lane.x + MinimapLanePadding + innerWidth * indentRatio
    )
    const availableWidth = Math.max(
      2,
      lane.x + lane.width - startX - MinimapLanePadding
    )
    const visibleLength = compactEmpty
      ? trimmedLength
      : Math.max(trimmedLength, 4)
    const primaryWidth = Math.max(
      2,
      Math.round(availableWidth * Math.min(1, visibleLength / 88))
    )

    if (trimmedLength <= 24 || availableWidth <= 8) {
      return {
        startX,
        primaryWidth,
        trailingX: null,
        trailingWidth: 0,
      }
    }

    const trailingWidth = Math.max(
      2,
      Math.round(availableWidth * Math.min(0.38, trimmedLength / 180))
    )
    const trailingX = Math.min(
      lane.x + lane.width - MinimapLanePadding - trailingWidth,
      startX + Math.max(3, Math.round(primaryWidth * 0.6))
    )

    return { startX, primaryWidth, trailingX, trailingWidth }
  }

  private getRowGeometry(
    row: SimplifiedDiffRow,
    top: number,
    rowHeight: number,
    contentHeight: number
  ): IRowGeometry {
    const minHeight =
      row.type === DiffRowType.Context
        ? 1
        : row.type === DiffRowType.Hunk
          ? MinHunkRowHeight
          : MinChangedRowHeight

    if (rowHeight >= minHeight) {
      return { top, height: rowHeight }
    }

    const height = Math.min(contentHeight, minHeight)
    const centeredTop = Math.round(top + rowHeight / 2 - height / 2)

    return {
      top: clamp(centeredTop, 0, Math.max(0, contentHeight - height)),
      height,
    }
  }

  private getLineBarHeight(rowHeight: number, emphasize: boolean) {
    if (!emphasize) {
      return Math.max(
        1,
        Math.min(MaxContextBarHeight, Math.round(rowHeight * 0.7))
      )
    }

    const minHeight = Math.min(2, Math.max(1, Math.ceil(rowHeight)))

    return clamp(
      Math.round(rowHeight * 0.55),
      minHeight,
      MaxChangedBarHeight
    )
  }

  private getLineMetrics(content: string): ILineMetrics {
    const cached = this.lineMetricsCache.get(content)
    if (cached !== undefined) {
      return cached
    }

    let leadingWidth = 0
    let totalWidth = 0
    let inLeadingWhitespace = true

    for (let i = 0; i < content.length; i++) {
      const charCode = content.charCodeAt(i)
      const charWidth = charCode === 9 ? 2 : 1

      totalWidth += charWidth

      if (!inLeadingWhitespace) {
        continue
      }

      if (charCode === 32 || charCode === 9) {
        leadingWidth += charWidth
      } else {
        inLeadingWhitespace = false
      }
    }

    const metrics: ILineMetrics = {
      leadingWidth,
      trimmedLength: totalWidth - leadingWidth,
    }
    this.lineMetricsCache.set(content, metrics)
    return metrics
  }

  private updateViewport() {
    const viewport = this.viewportRef.current
    const metrics = this.getViewportMetrics()

    if (viewport === null) {
      return
    }

    const nextState: IViewportRenderState =
      metrics === null
        ? { visible: false, top: 0, height: 0 }
        : {
            visible: metrics.maxScrollTop > 0,
            top: metrics.top,
            height: metrics.height,
          }

    const prevState = this.viewportRenderState
    if (
      prevState !== null &&
      prevState.visible === nextState.visible &&
      prevState.top === nextState.top &&
      prevState.height === nextState.height
    ) {
      return
    }

    if (prevState === null || prevState.visible !== nextState.visible) {
      viewport.style.display = nextState.visible ? 'block' : 'none'
    }

    if (nextState.visible) {
      if (prevState === null || prevState.height !== nextState.height) {
        viewport.style.height = `${nextState.height}px`
      }

      if (prevState === null || prevState.top !== nextState.top) {
        viewport.style.transform = `translateY(${nextState.top}px)`
      }
    }

    this.viewportRenderState = nextState
  }

  private getScrollMetrics(): IScrollMetrics | null {
    const container = this.containerRef.current
    const scrollContainer = this.scrollContainer

    if (container === null || scrollContainer === null) {
      return null
    }

    const trackHeight = container.clientHeight
    const { clientHeight, scrollHeight, scrollTop } = scrollContainer

    if (trackHeight === 0 || scrollHeight === 0) {
      return null
    }

    return {
      trackHeight,
      clientHeight,
      scrollHeight,
      scrollTop,
      maxScrollTop: Math.max(0, scrollHeight - clientHeight),
    }
  }

  private getViewportMetrics(
    scrollMetrics = this.getScrollMetrics()
  ): IViewportMetrics | null {
    if (scrollMetrics === null) {
      return null
    }

    const geometry = this.getViewportGeometry(scrollMetrics)

    return {
      top: geometry.top,
      height: geometry.height,
      maxScrollTop: scrollMetrics.maxScrollTop,
    }
  }

  private getViewportGeometry(
    scrollMetrics: IScrollMetrics
  ): IViewportGeometry {
    const baseGeometry =
      this.getAlignedViewportGeometry(scrollMetrics) ??
      this.getFallbackViewportGeometry(scrollMetrics)

    if (this.dragViewport === null) {
      return baseGeometry
    }

    // Keep the dragged thumb under the pointer, but let its height continue to
    // track the aligned viewport geometry so releasing the mouse does not cause
    // a separate height snap.
    return {
      top: clamp(
        this.dragViewport.top,
        0,
        scrollMetrics.trackHeight - baseGeometry.height
      ),
      height: baseGeometry.height,
    }
  }

  private getAlignedViewportGeometry(
    scrollMetrics: IScrollMetrics
  ): IViewportGeometry | null {
    const numRows = this.props.rows.length

    if (numRows === 0 || scrollMetrics.maxScrollTop === 0) {
      return null
    }

    const visibleBounds = this.getVisibleRowBounds()
    if (visibleBounds === null) {
      return null
    }

    // Project the visible logical row span back onto the minimap's uniform row
    // space. This keeps the viewport aligned even while react-virtualized is
    // still refining measured row heights in the scroll container.
    const idealTop = (visibleBounds.start / numRows) * scrollMetrics.trackHeight
    const idealBottom =
      (visibleBounds.end / numRows) * scrollMetrics.trackHeight
    const idealHeight = idealBottom - idealTop
    const height = Math.min(
      scrollMetrics.trackHeight,
      Math.max(MinViewportHeight, idealHeight)
    )
    const center = (idealTop + idealBottom) / 2
    return {
      top: clamp(center - height / 2, 0, scrollMetrics.trackHeight - height),
      height,
    }
  }

  private getFallbackViewportGeometry(
    scrollMetrics: IScrollMetrics
  ): IViewportGeometry {
    const height = Math.min(
      scrollMetrics.trackHeight,
      Math.max(
        MinViewportHeight,
        scrollMetrics.maxScrollTop === 0
          ? scrollMetrics.trackHeight
          : scrollMetrics.trackHeight *
              (scrollMetrics.clientHeight / scrollMetrics.scrollHeight)
      )
    )
    const maxTrackTop = Math.max(0, scrollMetrics.trackHeight - height)
    const top =
      scrollMetrics.maxScrollTop === 0
        ? 0
        : (scrollMetrics.scrollTop / scrollMetrics.maxScrollTop) * maxTrackTop

    return { top, height }
  }

  private onMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    const container = this.containerRef.current
    const scrollMetrics = this.getScrollMetrics()
    const metrics = this.getViewportMetrics(scrollMetrics)

    if (event.button !== 0) {
      return
    }

    if (container === null || metrics === null) {
      return
    }

    event.preventDefault()
    container.focus()

    const bounds = container.getBoundingClientRect()
    this.dragContainerTop = bounds.top
    const offsetY = event.clientY - bounds.top
    const viewportBottom = metrics.top + metrics.height

    if (offsetY >= metrics.top && offsetY <= viewportBottom) {
      this.dragOffset = offsetY - metrics.top
    } else {
      this.dragOffset = metrics.height / 2
    }

    this.dragViewport = { top: metrics.top, height: metrics.height }
    this.scheduleViewportUpdate()

    if (offsetY < metrics.top || offsetY > viewportBottom) {
      this.scrollFromTrackPosition(offsetY - this.dragOffset)
    }

    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.dragViewport === null) {
      return
    }

    if (this.containerRef.current === null) {
      return
    }

    const offsetY = event.clientY - this.dragContainerTop

    this.queueDragScroll(offsetY - this.dragOffset)
  }

  private onMouseUp = () => {
    this.flushQueuedDragScroll()
    this.resetDragState()
    this.removeDragListeners()
    this.scheduleViewportUpdate()
  }

  private resetDragState() {
    this.dragOffset = 0
    this.dragContainerTop = 0
    this.dragViewport = null
    this.pendingDragTrackTop = null
  }

  private removeDragListeners() {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }

  private queueDragScroll(trackTop: number) {
    this.pendingDragTrackTop = trackTop

    if (this.dragScrollFrameHandle !== null) {
      return
    }

    this.dragScrollFrameHandle = window.requestAnimationFrame(() => {
      this.dragScrollFrameHandle = null
      this.flushQueuedDragScroll()
    })
  }

  private flushQueuedDragScroll() {
    if (this.dragScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.dragScrollFrameHandle)
      this.dragScrollFrameHandle = null
    }

    const trackTop = this.pendingDragTrackTop
    this.pendingDragTrackTop = null

    if (trackTop === null || this.dragViewport === null) {
      return
    }

    this.scrollFromTrackPosition(trackTop)
  }

  private scrollFromTrackPosition(trackTop: number) {
    const scrollMetrics = this.getScrollMetrics()
    const metrics = this.getViewportMetrics(scrollMetrics)
    const scrollContainer = this.scrollContainer

    if (scrollMetrics === null || metrics === null || scrollContainer === null) {
      return
    }

    const maxTrackTop = Math.max(0, scrollMetrics.trackHeight - metrics.height)
    const clampedTop = clamp(trackTop, 0, maxTrackTop)

    if (this.dragViewport !== null) {
      this.dragViewport = { top: clampedTop, height: metrics.height }
      this.scheduleViewportUpdate()

      const targetScrollTop = this.getDragScrollTop(
        clampedTop,
        maxTrackTop,
        metrics,
        scrollMetrics,
        scrollContainer
      )
      if (targetScrollTop !== null) {
        this.props.onScrollToPosition(targetScrollTop)
        return
      }
    }

    const ratio = maxTrackTop === 0 ? 0 : clampedTop / maxTrackTop
    this.props.onScrollToPosition(ratio * scrollMetrics.maxScrollTop)
  }

  private getDragScrollTop(
    trackTop: number,
    maxTrackTop: number,
    viewportMetrics: IViewportMetrics,
    scrollMetrics: IScrollMetrics,
    scrollContainer: HTMLElement
  ): number | null {
    if (trackTop <= 0) {
      return 0
    }

    if (trackTop >= maxTrackTop) {
      return scrollMetrics.maxScrollTop
    }

    const visibleBounds = this.getVisibleRowBounds()
    const visibleRowSpan =
      visibleBounds === null ? 0 : visibleBounds.end - visibleBounds.start
    const numRows = this.props.rows.length

    if (visibleBounds === null || visibleRowSpan <= 0 || numRows === 0) {
      return null
    }

    // During drag we align the diff by logical row center rather than by raw
    // scrollHeight ratio. That avoids the thumb "slipping" when measured row
    // heights and estimated row heights differ.
    const desiredCenterRow =
      ((trackTop + viewportMetrics.height / 2) / scrollMetrics.trackHeight) *
      numRows
    const currentCenterRow = (visibleBounds.start + visibleBounds.end) / 2
    const pixelsPerRow = scrollContainer.clientHeight / visibleRowSpan

    return clamp(
      scrollContainer.scrollTop +
        (desiredCenterRow - currentCenterRow) * pixelsPerRow,
      0,
      scrollMetrics.maxScrollTop
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const scrollContainer = this.scrollContainer
    if (scrollContainer === null) {
      return
    }

    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    )
    const pageSize = Math.max(
      KeyboardScrollStep,
      Math.floor(scrollContainer.clientHeight * 0.9)
    )

    let nextScrollTop: number | null = null

    switch (event.key) {
      case 'ArrowUp':
        nextScrollTop = scrollContainer.scrollTop - KeyboardScrollStep
        break
      case 'ArrowDown':
        nextScrollTop = scrollContainer.scrollTop + KeyboardScrollStep
        break
      case 'PageUp':
        nextScrollTop = scrollContainer.scrollTop - pageSize
        break
      case 'PageDown':
        nextScrollTop = scrollContainer.scrollTop + pageSize
        break
      case 'Home':
        nextScrollTop = 0
        break
      case 'End':
        nextScrollTop = maxScrollTop
        break
      default:
        return
    }

    event.preventDefault()
    this.props.onScrollToPosition(clamp(nextScrollTop, 0, maxScrollTop))
  }

  private onWheel = (event: WheelEvent) => {
    const scrollContainer = this.scrollContainer
    if (scrollContainer === null) {
      return
    }

    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    )
    if (maxScrollTop === 0) {
      return
    }

    event.preventDefault()
    this.queueWheelScroll(this.getWheelScrollDelta(event, scrollContainer))
  }

  private queueWheelScroll(delta: number) {
    this.pendingWheelDelta += delta

    if (this.wheelScrollFrameHandle !== null) {
      return
    }

    this.wheelScrollFrameHandle = window.requestAnimationFrame(() => {
      this.wheelScrollFrameHandle = null
      this.flushQueuedWheelScroll()
    })
  }

  private flushQueuedWheelScroll() {
    if (this.wheelScrollFrameHandle !== null) {
      window.cancelAnimationFrame(this.wheelScrollFrameHandle)
      this.wheelScrollFrameHandle = null
    }

    const delta = this.pendingWheelDelta
    this.pendingWheelDelta = 0

    if (delta === 0) {
      return
    }

    const scrollContainer = this.scrollContainer
    if (scrollContainer === null) {
      return
    }

    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    )
    if (maxScrollTop === 0) {
      return
    }

    scrollContainer.scrollTop = clamp(
      scrollContainer.scrollTop + delta,
      0,
      maxScrollTop
    )
  }

  private getWheelScrollDelta(
    event: WheelEvent,
    scrollContainer: HTMLElement
  ) {
    switch (event.deltaMode) {
      case 1:
        return event.deltaY * this.getWheelLineHeight(scrollContainer)
      case 2:
        return (
          event.deltaY *
          Math.max(1, Math.floor(scrollContainer.clientHeight * 0.9))
        )
      default:
        return event.deltaY
    }
  }

  private getWheelLineHeight(scrollContainer: HTMLElement) {
    const container = this.containerRef.current ?? scrollContainer
    const styles = window.getComputedStyle(container)

    const diffLineHeight = Number.parseFloat(
      styles.getPropertyValue('--diff-line-height')
    )
    if (Number.isFinite(diffLineHeight)) {
      return diffLineHeight
    }

    const lineHeight = Number.parseFloat(styles.lineHeight)
    return Number.isFinite(lineHeight) ? lineHeight : 20
  }

  private getPalette(container: HTMLElement): IMinimapPalette {
    const styles = window.getComputedStyle(container)
    const changeColorBrightness =
      this.getThemeClassName() === 'theme-dark'
        ? MinimapChangeColorBrightnessDark
        : MinimapChangeColorBrightnessLight
    const added =
      styles.getPropertyValue('--diff-add-border-color').trim() || '#2da44e'
    const deleted =
      styles.getPropertyValue('--diff-delete-border-color').trim() || '#cf222e'
    const addedBackground =
      styles.getPropertyValue('--diff-add-background-color').trim() || '#dafbe1'
    const deletedBackground =
      styles.getPropertyValue('--diff-delete-background-color').trim() ||
      '#ffebe9'

    return {
      background:
        styles.getPropertyValue('--box-alt-background-color').trim() ||
        '#f6f8fa',
      border:
        styles.getPropertyValue('--diff-border-color').trim() || '#d0d7de',
      context:
        styles.getPropertyValue('--diff-text-color').trim() || '#24292f',
      added: brightenColor(added, changeColorBrightness),
      deleted: brightenColor(deleted, changeColorBrightness),
      hunk:
        styles.getPropertyValue('--diff-hunk-text-color').trim() || '#57606a',
      addedBackground: brightenColor(addedBackground, changeColorBrightness),
      deletedBackground: brightenColor(
        deletedBackground,
        changeColorBrightness
      ),
      hunkBackground:
        styles.getPropertyValue('--diff-hunk-background-color').trim() ||
        '#ddf4ff',
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function brightenColor(color: string, amount: number) {
  const parsedColor = parseColor(color)
  if (parsedColor === null) {
    return color
  }

  const brightenChannel = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)

  const red = brightenChannel(parsedColor.red)
  const green = brightenChannel(parsedColor.green)
  const blue = brightenChannel(parsedColor.blue)

  return parsedColor.alpha >= 1
    ? `rgb(${red}, ${green}, ${blue})`
    : `rgba(${red}, ${green}, ${blue}, ${parsedColor.alpha})`
}

function parseColor(color: string): IRGBColor | null {
  return parseHexColor(color) ?? parseRgbColor(color)
}

function parseHexColor(color: string): IRGBColor | null {
  if (!color.startsWith('#')) {
    return null
  }

  let hex = color.slice(1)

  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split('')
      .map(component => component + component)
      .join('')
  }

  if (hex.length !== 6 && hex.length !== 8) {
    return null
  }

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const alpha =
    hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1

  if (
    [red, green, blue, alpha].some(component => Number.isNaN(component))
  ) {
    return null
  }

  return { red, green, blue, alpha }
}

function parseRgbColor(color: string): IRGBColor | null {
  const match = color.match(/^rgba?\((.+)\)$/i)
  if (match === null) {
    return null
  }

  const parts = match[1].split(',').map(part => part.trim())
  if (parts.length < 3 || parts.length > 4) {
    return null
  }

  const red = parseRgbChannel(parts[0])
  const green = parseRgbChannel(parts[1])
  const blue = parseRgbChannel(parts[2])
  const alpha = parts.length === 4 ? parseAlphaChannel(parts[3]) : 1

  if (red === null || green === null || blue === null || alpha === null) {
    return null
  }

  return {
    red,
    green,
    blue,
    alpha,
  }
}

function parseRgbChannel(value: string): number | null {
  const parsed = value.endsWith('%')
    ? (Number.parseFloat(value) / 100) * 255
    : Number.parseFloat(value)

  return Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 255) : null
}

function parseAlphaChannel(value: string): number | null {
  const parsed = value.endsWith('%')
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value)

  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : null
}
