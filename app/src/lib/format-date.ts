import { format } from 'date-fns'
import {
  getDateFormatPreference,
  getTimeFormatPreference,
} from '../models/formatting-preferences'
import { enableFormattingPreferences } from './feature-flag'
import mem from 'mem'
import QuickLRU from 'quick-lru'

// Initializing a date formatter is expensive but formatting is relatively cheap
// so we cache them based on the locale and their options. The maxSize of a 100
// is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
const getDateFormatter = mem(Intl.DateTimeFormat, {
  cache: new QuickLRU({ maxSize: 100 }),
  cacheKey: (...args) => JSON.stringify(args),
})

interface IFormatDateOptions {
  /** Whether to include the date portion. Defaults to true. */
  readonly date?: boolean
  /** Whether to include the time portion. Defaults to true. */
  readonly time?: boolean
}

/**
 * Format a date using the user's preferred date and time format patterns.
 *
 * By default both date and time are included. Pass `{ date: false }` or
 * `{ time: false }` to include only one.
 */
export function formatDate(
  value: Date,
  { date = true, time = true }: IFormatDateOptions = {}
): string {
  if (isNaN(value.valueOf())) {
    return 'Invalid date'
  }

  if (!enableFormattingPreferences()) {
    return getDateFormatter('en-US', {
      dateStyle: date ? 'full' : undefined,
      timeStyle: time ? 'short' : undefined,
    }).format(value)
  }

  const parts: Array<string> = []

  if (date) {
    parts.push(format(value, getDateFormatPreference()))
  }

  if (time) {
    parts.push(format(value, getTimeFormatPreference()))
  }

  return parts.join(' ')
}
