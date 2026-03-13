import { format } from 'date-fns'

/**
 * A date format pattern compatible with date-fns format().
 */
export type DateFormat =
  | 'MMM d, yyyy'
  | 'MMMM do, yyyy'
  | 'MM/dd/yyyy'
  | 'dd/MM/yyyy'
  | 'dd-MM-yyyy'
  | 'dd.MM.yyyy'
  | 'yyyy/MM/dd'
  | 'yyyy-MM-dd'
  | 'yyyy.MM.dd'
  | 'MM/dd/yy'
  | 'dd/MM/yy'
  | 'dd-MM-yy'
  | 'dd.MM.yy'
  | 'yy/MM/dd'
  | 'yy-MM-dd'
  | 'yy.MM.dd'

/**
 * A time format pattern compatible with date-fns format().
 */
export type TimeFormat =
  | 'HH:mm:ss'
  | 'HH.mm.ss'
  | 'HH:mm'
  | 'HH.mm'
  | 'h:mm:ss aaa'
  | 'h.mm.ss aaa'
  | 'h:mm aaa'
  | 'h.mm aaa'

/**
 * Configuration for number formatting with separate thousands and decimal
 * separator characters.
 */
export interface INumberFormat {
  readonly thousandsSeparator: ',' | '.' | ' ' | ''
  readonly decimalSeparator: ',' | '.'
}

/** An unambiguous reference date for previewing date formats (Dec 25, 2025). */
const previewDate = new Date(2025, 11, 25, 14, 30, 45)

/**
 * All available date format patterns with their preview strings.
 */
export const dateFormats: ReadonlyArray<{
  readonly pattern: DateFormat
  readonly example: string
}> = (
  [
    'MMM d, yyyy',
    'MMMM do, yyyy',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'dd.MM.yyyy',
    'yyyy/MM/dd',
    'yyyy-MM-dd',
    'yyyy.MM.dd',
    'MM/dd/yy',
    'dd/MM/yy',
    'dd-MM-yy',
    'dd.MM.yy',
    'yy/MM/dd',
    'yy-MM-dd',
    'yy.MM.dd',
  ] as const
).map(pattern => ({
  pattern,
  example: format(previewDate, pattern),
}))

/**
 * All available time format patterns with their preview strings.
 */
export const timeFormats: ReadonlyArray<{
  readonly pattern: TimeFormat
  readonly example: string
}> = (
  [
    'HH:mm:ss',
    'HH.mm.ss',
    'HH:mm',
    'HH.mm',
    'h:mm:ss aaa',
    'h.mm.ss aaa',
    'h:mm aaa',
    'h.mm aaa',
  ] as const
).map(pattern => ({
  pattern,
  example: format(previewDate, pattern),
}))

/**
 * Format a number using the given separator configuration.
 *
 * This is a simple formatter that handles integer and decimal parts with
 * configurable separators. It is not intended to be a full locale-aware
 * number formatter.
 */
export function formatNumber(value: number, fmt: INumberFormat): string {
  const isNegative = value < 0
  const abs = Math.abs(value)
  const [intPart, decPart] = abs.toString().split('.')

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\x00')
  const formattedInt = grouped.replace(/\x00/g, fmt.thousandsSeparator)

  const result =
    decPart !== undefined
      ? `${formattedInt}${fmt.decimalSeparator}${decPart}`
      : formattedInt

  return isNegative ? `-${result}` : result
}

/** Preview number used to demonstrate number formatting (1,234,567.89). */
const previewNumber = 1234567.89

/**
 * All valid number format configurations with their preview strings.
 *
 * Excludes configurations where the thousands and decimal separator are the
 * same character.
 */
export const numberFormats: ReadonlyArray<{
  readonly format: INumberFormat
  readonly example: string
}> = [
  { thousandsSeparator: '', decimalSeparator: '.' },
  { thousandsSeparator: '', decimalSeparator: ',' },
  { thousandsSeparator: ',', decimalSeparator: '.' },
  { thousandsSeparator: '.', decimalSeparator: ',' },
  { thousandsSeparator: ' ', decimalSeparator: '.' },
  { thousandsSeparator: ' ', decimalSeparator: ',' },
].map(fmt => ({
  format: fmt as INumberFormat,
  example: formatNumber(previewNumber, fmt as INumberFormat),
}))

export const defaultDateFormat: DateFormat = 'MMM d, yyyy'
export const defaultTimeFormat: TimeFormat = 'h:mm aaa'
export const defaultNumberFormat: INumberFormat = {
  thousandsSeparator: '',
  decimalSeparator: '.',
}

const dateFormatKey = 'dateFormat'
const timeFormatKey = 'timeFormat'
const numberFormatKey = 'numberFormat'

/** Get the user's preferred date format from localStorage. */
export function getDateFormatPreference(): DateFormat {
  return (
    (localStorage.getItem(dateFormatKey) as DateFormat) ?? defaultDateFormat
  )
}

/** Get the user's preferred time format from localStorage. */
export function getTimeFormatPreference(): TimeFormat {
  return (
    (localStorage.getItem(timeFormatKey) as TimeFormat) ?? defaultTimeFormat
  )
}

/** Get the user's preferred number format from localStorage. */
export function getNumberFormatPreference(): INumberFormat {
  const key = localStorage.getItem(numberFormatKey)
  return key ? numberFormatFromKey(key) : defaultNumberFormat
}

/** Set the user's preferred date format in localStorage. */
export function setDateFormatPreference(format: DateFormat): void {
  localStorage.setItem(dateFormatKey, format)
}

/** Set the user's preferred time format in localStorage. */
export function setTimeFormatPreference(format: TimeFormat): void {
  localStorage.setItem(timeFormatKey, format)
}

/** Set the user's preferred number format in localStorage. */
export function setNumberFormatPreference(format: INumberFormat): void {
  localStorage.setItem(numberFormatKey, numberFormatToKey(format))
}

/**
 * Serialize a number format to a stable string key for use in select elements
 * and localStorage.
 */
export function numberFormatToKey(fmt: INumberFormat): string {
  return `${fmt.thousandsSeparator}|${fmt.decimalSeparator}`
}

/**
 * Deserialize a number format key back to an INumberFormat, returning the
 * default if the key is invalid.
 */
export function numberFormatFromKey(key: string): INumberFormat {
  const match = numberFormats.find(n => numberFormatToKey(n.format) === key)
  return match?.format ?? defaultNumberFormat
}

const relativeTimeInCommitListKey = 'relativeTimeInCommitList'
const relativeTimeInBranchListKey = 'relativeTimeInBranchList'

/** Whether to show relative time in the commit list. Defaults to true. */
export function getRelativeTimeInCommitList(): boolean {
  return localStorage.getItem(relativeTimeInCommitListKey) !== '0'
}

/** Whether to show relative time in the branch list. Defaults to true. */
export function getRelativeTimeInBranchList(): boolean {
  return localStorage.getItem(relativeTimeInBranchListKey) !== '0'
}

export function setRelativeTimeInCommitList(value: boolean): void {
  localStorage.setItem(relativeTimeInCommitListKey, value ? '1' : '0')
}

export function setRelativeTimeInBranchList(value: boolean): void {
  localStorage.setItem(relativeTimeInBranchListKey, value ? '1' : '0')
}
