/**
 * 桌面 TODO · GitHub Releases 便携版更新器
 * 检查公开仓库的最新 Release，下载并校验便携 EXE，再通过独立脚本完成替换和重启。
 */
const electron = require('electron')
const app = electron.app
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const OWNER = 'xxeryjy'
const REPO = 'to-do'
const RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
const USER_AGENT = 'DesktopTODO-Updater'

function currentAppVersion() {
  return app && typeof app.getVersion === 'function'
    ? app.getVersion()
    : require('../package.json').version
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split('-')[0]
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map((part) => parseInt(part, 10) || 0)
  const b = normalizeVersion(right).split('.').map((part) => parseInt(part, 10) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github+json',
        ...(options.headers || {})
      },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

function powershellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

class GithubUpdater extends EventEmitter {
  constructor() {
    super()
    this.currentVersion = currentAppVersion()
    this.info = null
    this.checking = false
    this.status = {
      status: 'idle',
      currentVersion: this.currentVersion,
      updateAvailable: false,
      progress: 0
    }
  }

  snapshot(extra = {}) {
    this.status = {
      ...this.status,
      currentVersion: this.currentVersion,
      ...extra
    }
    return { ...this.status }
  }

  emitStatus(extra = {}) {
    const state = this.snapshot(extra)
    this.emit('status', state)
    return state
  }

  async checkForUpdates({ manual = false } = {}) {
    if (this.checking) return this.snapshot()
    this.checking = true
    this.emitStatus({ status: 'checking', manual, error: '', errorCode: '' })

    try {
      const response = await fetchWithTimeout(RELEASE_API)
      if (response.status === 404) {
        this.info = null
        return this.emitStatus({
          status: 'no-release',
          updateAvailable: false,
          manual,
          latestVersion: '',
          releaseNotes: '',
          assetName: ''
        })
      }
      if (!response.ok) throw new Error(`GitHub ${response.status}`)

      const release = await response.json()
      const latestVersion = normalizeVersion(release.tag_name)
      const updateAvailable = compareVersions(latestVersion, this.currentVersion) > 0
      const assets = Array.isArray(release.assets) ? release.assets : []
      const asset = this.selectPortableAsset(assets, latestVersion)
      const checksumAsset = asset ? this.selectChecksumAsset(assets, asset, latestVersion) : null

      this.info = updateAvailable && asset
        ? {
            tagName: release.tag_name,
            latestVersion,
            releaseNotes: String(release.body || '').slice(0, 4000),
            publishedAt: release.published_at || '',
            asset,
            checksumAsset
          }
        : null

      return this.emitStatus({
        status: updateAvailable ? 'available' : 'up-to-date',
        updateAvailable,
        manual,
        latestVersion,
        releaseNotes: String(release.body || '').slice(0, 4000),
        assetName: asset?.name || '',
        hasChecksum: !!(asset?.digest || checksumAsset)
      })
    } catch (error) {
      const aborted = error && error.name === 'AbortError'
      return this.emitStatus({
        status: 'error',
        updateAvailable: false,
        manual,
        errorCode: aborted ? 'TIMEOUT' : 'CHECK_FAILED',
        error: aborted ? 'Request timed out' : (error.message || String(error))
      })
    } finally {
      this.checking = false
    }
  }

  selectPortableAsset(assets, latestVersion) {
    const exeAssets = assets.filter((asset) => /\.exe$/i.test(asset.name || ''))
    return exeAssets.find((asset) => String(asset.name).includes(latestVersion))
      || exeAssets.find((asset) => /便携版/i.test(asset.name || ''))
      || null
  }

  selectChecksumAsset(assets, asset, latestVersion) {
    const expectedName = `${asset.name}.sha256`.toLowerCase()
    return assets.find((item) => String(item.name || '').toLowerCase() === expectedName)
      || assets.find((item) => /sha256/i.test(item.name || '') && String(item.name).includes(latestVersion))
      || null
  }

  async expectedSha256() {
    if (!this.info) return ''
    if (this.info.asset.digest && String(this.info.asset.digest).startsWith('sha256:')) {
      return String(this.info.asset.digest).slice('sha256:'.length).toLowerCase()
    }
    if (!this.info.checksumAsset) return ''
    const response = await fetchWithTimeout(this.info.checksumAsset.browser_download_url, {
      headers: { Accept: 'application/octet-stream' }
    })
    if (!response.ok) throw new Error(`GitHub ${response.status}`)
    const content = await response.text()
    const match = content.match(/\b[a-f0-9]{64}\b/i)
    return match ? match[0].toLowerCase() : ''
  }

  portableExecutablePath() {
    const portableFile = process.env.PORTABLE_EXECUTABLE_FILE
    if (portableFile && fs.existsSync(portableFile)) return portableFile
    return ''
  }

  async downloadAndInstall({ quitForUpdate } = {}) {
    if (!this.info || !this.info.asset) {
      return { ok: false, errorCode: 'NO_UPDATE', error: 'No update is available' }
    }

    const targetExe = this.portableExecutablePath()
    if (!targetExe) {
      const error = 'Automatic replacement is only available in the portable EXE build'
      this.emitStatus({ status: 'error', errorCode: 'PORTABLE_ONLY', error })
      return { ok: false, errorCode: 'PORTABLE_ONLY', error }
    }

    const asset = this.info.asset
    const downloadPath = path.join(app.getPath('temp'), `DesktopTODO-update-${this.info.latestVersion}.exe`)
    const partialPath = `${downloadPath}.part`

    try {
      const expectedHash = await this.expectedSha256()
      if (!expectedHash) throw Object.assign(new Error('Release checksum is missing'), { code: 'MISSING_CHECKSUM' })

      this.emitStatus({ status: 'downloading', progress: 0, error: '', errorCode: '' })
      const response = await fetchWithTimeout(asset.browser_download_url, {
        headers: { Accept: 'application/octet-stream' }
      }, 10 * 60 * 1000)
      if (!response.ok) throw new Error(`GitHub ${response.status}`)

      const total = Number(response.headers.get('content-length')) || Number(asset.size) || 0
      const handle = await fs.promises.open(partialPath, 'w')
      const hash = crypto.createHash('sha256')
      let received = 0
      let lastEmit = 0
      try {
        for await (const chunk of response.body) {
          await handle.write(chunk)
          hash.update(chunk)
          received += chunk.length
          const progress = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0
          const now = Date.now()
          if (now - lastEmit >= 180) {
            this.emitStatus({ status: 'downloading', progress })
            lastEmit = now
          }
        }
      } finally {
        await handle.close()
      }

      const actualHash = hash.digest('hex').toLowerCase()
      if (actualHash !== expectedHash) {
        throw Object.assign(new Error('Downloaded file checksum does not match'), { code: 'CHECKSUM_MISMATCH' })
      }

      const signature = Buffer.alloc(2)
      const checkHandle = await fs.promises.open(partialPath, 'r')
      try {
        await checkHandle.read(signature, 0, 2, 0)
      } finally {
        await checkHandle.close()
      }
      if (signature.toString('ascii') !== 'MZ') {
        throw Object.assign(new Error('Downloaded file is not a Windows executable'), { code: 'INVALID_EXE' })
      }

      await fs.promises.rm(downloadPath, { force: true })
      await fs.promises.rename(partialPath, downloadPath)
      this.emitStatus({ status: 'installing', progress: 100 })

      this.spawnInstallHelper({ targetExe, downloadPath })
      if (typeof quitForUpdate === 'function') {
        setTimeout(quitForUpdate, 350)
      }
      return { ok: true }
    } catch (error) {
      await fs.promises.rm(partialPath, { force: true }).catch(() => {})
      const errorCode = error.code || 'UPDATE_FAILED'
      this.emitStatus({ status: 'error', errorCode, error: error.message || String(error) })
      return { ok: false, errorCode, error: error.message || String(error) }
    }
  }

  spawnInstallHelper({ targetExe, downloadPath }) {
    const scriptPath = path.join(app.getPath('temp'), `desktop-todo-update-${process.pid}.ps1`)
    const backupPath = `${targetExe}.update-backup`
    const script = `
$ErrorActionPreference = 'Stop'
$processId = ${process.pid}
while (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
  Start-Sleep -Milliseconds 400
}
Start-Sleep -Seconds 2
$target = ${powershellQuote(targetExe)}
$download = ${powershellQuote(downloadPath)}
$backup = ${powershellQuote(backupPath)}
$installed = $false
try {
  Copy-Item -LiteralPath $target -Destination $backup -Force
  Copy-Item -LiteralPath $download -Destination $target -Force
  $installed = $true
  Start-Process -FilePath $target
} catch {
  if (Test-Path -LiteralPath $backup) {
    Copy-Item -LiteralPath $backup -Destination $target -Force
    Start-Process -FilePath $target
  }
} finally {
  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
  if ($installed) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
}
`
    // Windows PowerShell 5.1 需要 BOM 才能正确识别中文路径
    fs.writeFileSync(scriptPath, `\ufeff${script}`, 'utf8')
    const helper = spawn('powershell.exe', [
      '-NoProfile',
      '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    helper.unref()
  }
}

const updater = new GithubUpdater()

module.exports = updater
module.exports.GithubUpdater = GithubUpdater
module.exports.normalizeVersion = normalizeVersion
module.exports.compareVersions = compareVersions
