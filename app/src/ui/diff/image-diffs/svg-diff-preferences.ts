const svgDiffShowCodeKey = 'svg-diff-show-code'

/** Returns the persisted user preference for showing SVG diffs as code (true) or image (false). Defaults to true. */
export function getSvgDiffShowCode(): boolean {
  return localStorage.getItem(svgDiffShowCodeKey) !== 'false'
}

export function saveSvgDiffShowCode(showCode: boolean): void {
  localStorage.setItem(svgDiffShowCodeKey, String(showCode))
}
