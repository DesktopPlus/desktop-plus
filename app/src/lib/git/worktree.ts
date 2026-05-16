import { git } from './core'
import { Repository } from '../../models/repository'
import * as Path from 'path'
import * as Fs from 'fs'
import type { WorktreeEntry, WorktreeType } from '../../models/worktree'
import { normalizePath } from '../helpers/path'

/**
 * Get the set of canonical branch refs (e.g. `refs/heads/feature`)
 * checked out in any worktree (main or linked).
 */
export async function getWorktreeCheckedOutBranches(
  repository: Repository
): Promise<ReadonlySet<string>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repository.path,
    'getWorktreeCheckedOutBranches'
  )

  const branches = new Set<string>()

  // With -z, lines are NUL-terminated and blocks are separated by
  // double NUL (i.e. an empty string between two NUL terminators).
  const blocks = result.stdout.split('\0\0')

  for (const block of blocks) {
    for (const line of block.split('\0')) {
      if (line.startsWith('branch ')) {
        branches.add(line.substring('branch '.length))
      }
    }
  }

  return branches
}

function getDotGitPath(repositoryPath: string): string {
  return Path.join(repositoryPath, '.git')
}

export interface IWorktreePathInfo {
  readonly isLinkedWorktree: boolean
  readonly mainWorktreePath: string | null
}

export function parseWorktreePorcelainOutput(
  stdout: string
): ReadonlyArray<WorktreeEntry> {
  if (stdout.trim().length === 0) {
    return []
  }

  const blocks = stdout.trim().split('\n\n')
  const entries: WorktreeEntry[] = []

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isDetached = false
    let isLocked = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring('worktree '.length)
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
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorktrees'
  )

  return parseWorktreePorcelainOutput(result.stdout)
}

export async function addWorktree(
  repository: Repository,
  path: string,
  options: {
    readonly branch?: string
    readonly createBranch?: string
    readonly detach?: boolean
    readonly commitish?: string
  } = {}
): Promise<void> {
  const args = ['worktree', 'add']

  if (options.detach) {
    args.push('--detach')
  }

  if (options.createBranch) {
    args.push('-b', options.createBranch)
  }

  args.push(path)

  if (options.branch) {
    args.push(options.branch)
  } else if (options.commitish) {
    args.push(options.commitish)
  }

  await git(args, repository.path, 'addWorktree')
}

export async function removeWorktree(
  repository: Repository,
  path: string
): Promise<void> {
  const args = ['worktree', 'remove', '--force', path]
  await git(args, repository.path, 'removeWorktree')
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

export async function isLinkedWorktree(
  repository: Repository
): Promise<boolean> {
  const worktrees = await listWorktrees(repository)
  const repoPath = normalizePath(repository.path)

  return worktrees.some(
    wt => wt.type === 'linked' && normalizePath(wt.path) === repoPath
  )
}

export async function getMainWorktreePath(
  repository: Repository
): Promise<string | null> {
  const worktrees = await listWorktrees(repository)
  const main = worktrees.find(wt => wt.type === 'main')
  return main?.path ?? null
}

export function getWorktreePathInfoSync(
  repositoryPath: string
): IWorktreePathInfo | null {
  try {
    const dotGit = getDotGitPath(repositoryPath)
    // eslint-disable-next-line no-sync
    const stats = Fs.statSync(dotGit)

    if (stats.isDirectory()) {
      return { isLinkedWorktree: false, mainWorktreePath: repositoryPath }
    }

    if (!stats.isFile()) {
      return null
    }

    // eslint-disable-next-line no-sync
    const contents = Fs.readFileSync(dotGit, 'utf8').trim()
    if (!contents.startsWith('gitdir: ')) {
      return null
    }

    const gitDirPath = Path.resolve(
      repositoryPath,
      contents.substring('gitdir: '.length)
    )

    // eslint-disable-next-line no-sync
    const commondir = Fs.readFileSync(
      Path.join(gitDirPath, 'commondir'),
      'utf8'
    ).trim()
    if (commondir.length === 0) {
      return null
    }

    const commonGitDir = Path.resolve(gitDirPath, commondir)
    return {
      isLinkedWorktree: true,
      mainWorktreePath: Path.dirname(commonGitDir),
    }
  } catch {
    return null
  }
}
