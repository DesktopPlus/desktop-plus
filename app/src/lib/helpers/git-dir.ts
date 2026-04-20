import { Repository } from '../../models/repository'
import * as Fs from 'fs'
import { memoize } from 'lodash'
import * as Path from 'path'

export function dotGitPath(repository: Repository, ...paths: string[]): string {
  const gitDirPath = getGitDirectoryBase(repository)
  const gitDir = Path.join(gitDirPath, ...paths)
  return gitDir
}

const getGitDirectoryBase = memoize((repository: Repository) => {
  const dotGit = Path.join(repository.path, '.git')
  try {
    // eslint-disable-next-line no-sync
    const stats = Fs.statSync(dotGit)
    if (stats.isDirectory()) {
      return dotGit
    }
    if (!stats.isFile()) {
      throw new Error('Not a valid git directory')
    }

    // eslint-disable-next-line no-sync
    const contents = Fs.readFileSync(dotGit, 'utf8').trim()
    const gitDirPath = contents.replace(/^gitdir: /, '')
    if (Path.isAbsolute(gitDirPath)) {
      return gitDirPath
    } else {
      return Path.join(repository.path, gitDirPath)
    }
  } catch (e) {
    return dotGit
  }
})
