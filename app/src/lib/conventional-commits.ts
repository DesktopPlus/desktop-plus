import { RE2JS } from 're2js'

/**
 * The Conventional Commit types we recognise, in the exact capitalization shown in the badge.
 */
const conventionalCommitTypeLabels: ReadonlyArray<string> = [
  'Feat',
  'Feature',
  'Fix',
  'Hotfix',
  'Fixes',
  'Chore',
  'Revert',
  'Style',
  'Spelling',
  'Docs',
  'Doc',
  'Documentation',
  'Build',
  'Refactor',
  'Test',
  'CI',
  'Perf',
  'Performance',
  'Deps',
  'Dependency',
  'Dependencies',
  'Security',
  'Release',
  'Temp',
  'Tmp',
  'WIP',
  'Config',
  'Configuration',
  'Infra',
  'Infrastructure',
  'Ops',
  'Operations',
  'UI',
  'UX',
  'Design',
]

const conventionalCommitLabelsByType = new Map<string, string>(
  conventionalCommitTypeLabels.map(label => [label.toLowerCase(), label])
)

/**
 * Matches the Conventional Commits prefix `type(scope)!: ` at the start of a
 * commit summary, capturing the type, the optional scope and the optional
 * breaking-change (`!`) marker.
 */
const conventionalCommitPattern = RE2JS.compile(
  '^\\s*(\\w+)(?:\\((.+?)\\))?(!)?: *'
)

/** A parsed Conventional Commit prefix. */
export interface IConventionalCommit {
  /** The raw, lower-case type (e.g. `feat`). Used to pick the badge color. */
  readonly rawType: string

  /** The human readable label shown in the badge (e.g. `Feature`, `Fix!`). */
  readonly label: string

  /** The optional scope (the text inside the parentheses), or null. */
  readonly scope: string | null

  /** The remainder of the summary, with the prefix stripped. */
  readonly rest: string
}

/**
 * Parses a commit summary as a Conventional Commit.
 *
 * Returns the parsed prefix (type, scope, breaking-change marker and the
 * remaining text) when the summary starts with a recognised Conventional
 * Commit prefix, or `null` otherwise.
 *
 * This is deliberately allocation-light and short-circuits as early as possible
 * because it runs on the render path of the commit list.
 */
export function parseConventionalCommit(
  summary: string
): IConventionalCommit | null {
  const matcher = conventionalCommitPattern.matcher(summary)

  if (!matcher.lookingAt()) {
    return null
  }

  const matchedType = matcher.group(1)
  if (matchedType === null) {
    return null
  }

  // The Conventional Commits spec allows any casing for the type, normalise to lower case
  const rawType = matchedType.toLowerCase()
  const baseLabel = conventionalCommitLabelsByType.get(rawType) ?? rawType

  const isBreaking = matcher.group(3) !== null

  return {
    rawType,
    label: isBreaking ? `${baseLabel}!` : baseLabel,
    scope: matcher.group(2),
    rest: summary.substring(matcher.end()),
  }
}
