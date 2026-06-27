import { promisify } from 'util'
import { join } from 'path'

import glob = require('glob')
const globPromise = promisify(glob)

import { readFile, writeFile, rename } from 'fs-extra'

import { getVersion } from '../app/package-info'
import {
  getArchitectureForFileName,
  getDistPath,
  getDistRoot,
} from './dist-info'

function getArchitecture() {
  const arch = process.env.npm_config_arch || process.arch
  switch (arch) {
    case 'arm64':
      return 'aarch64'
    default:
      return 'x86_64'
  }
}

const distRoot = getDistRoot()

// best guess based on documentation
type RedhatOptions = {
  // required
  src: string
  dest: string
  arch: string
  // optional
  description?: string
  productDescription?: string
  categories?: Array<string>
  icon?: any
  scripts?: {
    pre?: string
    post?: string
    preun?: string
    postun?: string
  }
  homepage?: string
  mimeType?: Array<string>
  requires?: Array<string>
}

const options: RedhatOptions = {
  src: getDistPath(),
  dest: distRoot,
  arch: getArchitecture(),
  description: 'Simple collaboration from your desktop',
  productDescription:
    'GitHub Desktop fork with advanced functionality and improvements.',
  categories: ['GNOME', 'GTK', 'Development'],
  requires: [
    // dugite-native dependencies
    '(libcurl or libcurl4)',
    // keytar dependencies
    'libsecret',
    'gnome-keyring',
  ],
  icon: {
    '32x32': 'app/static/linux/logos/32x32.png',
    '64x64': 'app/static/linux/logos/64x64.png',
    '128x128': 'app/static/linux/logos/128x128.png',
    '256x256': 'app/static/linux/logos/256x256.png',
    '512x512': 'app/static/linux/logos/512x512.png',
    '1024x1024': 'app/static/linux/logos/1024x1024.png',
  },
  scripts: {
    post: 'script/resources/rpm/post.sh',
    preun: 'script/resources/rpm/preun.sh',
  },
  homepage: 'https://desktop-plus.org',
  mimeType: [
    'x-scheme-handler/x-github-client',
    'x-scheme-handler/x-github-desktop-auth',
    // workaround for handling OAuth flow until we figure out what we're doing
    // with the development OAuth details
    //
    // see https://github.com/shiftkey/desktop/issues/72 for more details
    'x-scheme-handler/x-github-desktop-dev-auth',
  ],
}

export async function packageRedhat(): Promise<string> {
  if (process.platform === 'win32') {
    return Promise.reject('Windows is not supported')
  }

  const installer = require('electron-installer-redhat')

  // The Copilot extension bundles pre-built binaries for multiple CPU
  // architectures (arm64, armhf, loong64, riscv64d, …) as plain resources.
  // When rpmbuild runs brp-strip on an x86_64 host it calls /usr/bin/strip on
  // every ELF file it finds, which exits with code 1 for non-x86_64 binaries
  // and aborts the build. The upstream spec template already guards against
  // this for genuine cross-compilation (%if _host_cpu != _target_cpu), but
  // here both are x86_64 so that condition is always false. Patching the
  // generated spec to set %global __strip /bin/true unconditionally disables
  // stripping entirely, which is fine for an Electron app.
  const { Installer } = installer
  const originalCreateSpec = Installer.prototype.createSpec
  Installer.prototype.createSpec = async function (this: any) {
    await originalCreateSpec.call(this)
    const specContent: string = await readFile(this.specPath, 'utf8')
    await writeFile(this.specPath, '%global __strip /bin/true\n' + specContent)
  }

  try {
    await installer(options)
  } finally {
    Installer.prototype.createSpec = originalCreateSpec
  }
  const installersPath = `${distRoot}/desktop-plus*.rpm`

  const files = await globPromise(installersPath)

  if (files.length !== 1) {
    return Promise.reject(
      `Expected one file but instead found '${files.join(', ')}' - exiting...`
    )
  }

  const oldPath = files[0]

  const newFileName = `DesktopPlus-v${getVersion()}-linux-${getArchitectureForFileName()}.rpm`
  const newPath = join(distRoot, newFileName)
  await rename(oldPath, newPath)

  return Promise.resolve(newPath)
}
