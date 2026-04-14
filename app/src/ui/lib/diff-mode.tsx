import { getBoolean, setBoolean } from '../../lib/local-storage'

export const ShowSideBySideDiffDefault = false
const showSideBySideDiffKey = 'show-side-by-side-diff'
export const ShowDiffMinimapDefault = true
const showDiffMinimapKey = 'show-diff-minimap'
export const ShowWholeFileDefault = false
const showWholeFileKey = 'show-whole-file'

/**
 * Gets a value indicating whether not to present diffs in a split view mode
 * as opposed to unified (the default).
 */
export function getShowSideBySideDiff(): boolean {
  return getBoolean(showSideBySideDiffKey, ShowSideBySideDiffDefault)
}

/**
 * Sets a local storage key indicating whether not to present diffs in a split
 * view mode as opposed to unified (the default).
 */
export function setShowSideBySideDiff(showSideBySideDiff: boolean) {
  setBoolean(showSideBySideDiffKey, showSideBySideDiff)
}

/**
 * Gets a value indicating whether to present the diff minimap.
 */
export function getShowDiffMinimap(): boolean {
  return getBoolean(showDiffMinimapKey, ShowDiffMinimapDefault)
}

/**
 * Sets a local storage key indicating whether to present the diff minimap.
 */
export function setShowDiffMinimap(showDiffMinimap: boolean) {
  setBoolean(showDiffMinimapKey, showDiffMinimap)
}

/**
 * Gets a value indicating whether to keep text diffs expanded to the whole file.
 */
export function getShowWholeFile(): boolean {
  return getBoolean(showWholeFileKey, ShowWholeFileDefault)
}

/**
 * Sets a local storage key indicating whether to keep text diffs expanded to
 * the whole file.
 */
export function setShowWholeFile(showWholeFile: boolean) {
  setBoolean(showWholeFileKey, showWholeFile)
}
