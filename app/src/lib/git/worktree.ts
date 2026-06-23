import * as Path from 'path'
import { readFile } from 'fs/promises'
import type { Repository } from '../../models/repository'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { git } from './core'
import { directoryExists } from '../directory-exists'

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  // With -z, worktree blocks are separated by double NUL and fields within
  // a block are separated by single NUL
  const blocks = stdout.replace(/\0$/, '').split('\0\0')
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\0')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        // Git for Windows will output paths using forward slashes, i.e.
        // c:/Users/niik/... but repositories added in Desktop always pass
        // through getRepositoryType which uses path.resolve to deduce the
        // absolute top level directory and that will normalize paths as well
        // so by normalizing here we can be more confident about comparing paths
        path = Path.normalize(line.substring('worktree '.length))
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = line.substring('branch '.length)
      } else if (line === 'detached') {
        isDetached = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        isLocked = true
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        isPrunable = true
      }
    }

    const type: WorktreeType = i === 0 ? 'main' : 'linked'
    entries.push({ path, head, branch, isDetached, type, isLocked, isPrunable })
  }

  return entries
}

export async function listWorktrees(
  repository: Repository
): Promise<ReadonlyArray<WorktreeEntry>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repository.path,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout)
}

/**
 * Path to the main worktree's working directory for a repository pointing at a
 * linked worktree, derived purely from on-disk Git metadata so it still works
 * when the linked worktree's working directory is gone.
 *
 * Returns null when it can't be determined (unknown `gitDir`) or doesn't exist.
 */
export async function getMainWorktreePath(
  repository: Repository
): Promise<string | null> {
  const { gitDir } = repository
  if (gitDir === undefined) {
    return null
  }

  const commonDir = await resolveCommonGitDir(gitDir)
  const mainWorktreePath = Path.dirname(commonDir)

  if (!(await directoryExists(mainWorktreePath))) {
    return null
  }
  return mainWorktreePath
}

async function resolveCommonGitDir(gitDir: string): Promise<string> {
  if (Path.basename(Path.dirname(gitDir)) !== 'worktrees') {
    return gitDir
  }

  // Prefer the `commondir` file, but fall back to the conventional layout (two
  // levels up) when it's unreadable, e.g. `git worktree remove` deleted the
  // worktree's admin files too.
  const conventionalCommonDir = Path.dirname(Path.dirname(gitDir))
  return readFile(Path.join(gitDir, 'commondir'), 'utf8')
    .then(content => content.replace(/\r?\n$/, ''))
    .then(p => (p ? Path.resolve(gitDir, p) : conventionalCommonDir))
    .catch(() => conventionalCommonDir)
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    /** Branch name used with -b (create new branch) */
    readonly createBranch?: string
    /** Commit-ish to check out (branch name, ref, or SHA) */
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repositoryPath: string,
  worktreePath: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)

  await git(args, repositoryPath, 'removeWorktree')
}

export async function pruneWorktrees(repository: Repository): Promise<void> {
  await git(['worktree', 'prune'], repository.path, 'pruneWorktrees')
}

export async function moveWorktree(
  repository: Repository,
  oldPath: string,
  newPath: string
): Promise<void> {
  await git(
    ['worktree', 'move', oldPath, newPath],
    repository.path,
    'moveWorktree'
  )
}
