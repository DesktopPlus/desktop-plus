import { GitProgressParser } from './git'

/**
 * Highly approximate (some would say outright inaccurate) division
 * of the individual progress reporting steps in a fetch operation
 */
const steps = [
  { title: 'remote: Compressing objects', weight: 0.1 },
  { title: 'Receiving objects', weight: 0.7 },
  { title: 'Resolving deltas', weight: 0.2 },
]

/**
 * A utility class for interpreting the output from `git fetch --progress`
 * and turning that into a percentage value estimating the overall progress
 * of the fetch.
 */
export class FetchProgressParser extends GitProgressParser {
  public constructor() {
    super(steps)
  }
}

/**
 * Progress steps for a single-branch fetch operation. Unlike a full fetch,
 * Highly approximate (some would say outright inaccurate) division
 * of the individual progress reporting steps in a fetch operation
 */
const singleBranchFetchSteps = [
  { title: 'remote: Enumerating objects', weight: 0.1 },
  { title: 'remote: Counting objects', weight: 0.2 },
  { title: 'remote: Compressing objects', weight: 0.3 },
  { title: 'remote', weight: 0.4 },
]

/**
 * A utility class for interpreting the output from
 * `git fetch --progress <remote> <branch>` and turning that into a percentage
 * value estimating the overall progress of a single branch fetch.
 */
export class SingleBranchFetchProgressParser extends GitProgressParser {
  public constructor() {
    super(singleBranchFetchSteps)
  }
}
