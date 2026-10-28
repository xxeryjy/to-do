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
const { spawn, spawnSync } = require('child_process')

const OWNER = 'xxeryjy'
const REPO = 'to-do'
const RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
const USER_AGENT = 'DesktopTODO-Updater'
let installedAutoUpdater = null

function getInstalledAutoUpdater() {
  if (!installedAutoUpdater) {
    installedAutoUpdater = require('electron-updater').autoUpdater
  }
  return installedAutoUpdater
}

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
    if (this.isInstalledBuild()) {
      const autoUpdater = getInstalledAutoUpdater()
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.allowPrerelease = false
    }
  }

  isInstalledBuild() {
    return !!app && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE
  }

  async checkInstalledUpdates({ manual = false } = {}) {
    if (this.checking) return this.snapshot()
    this.checking = true
    this.emitStatus({ status: 'checking', manual, error: '', errorCode: '' })
    try {
      const autoUpdater = getInstalledAutoUpdater()
      const result = await autoUpdater.checkForUpdates()
      const updateInfo = result && result.updateInfo
      if (!updateInfo) {
        this.info = null
        return this.emitStatus({ status: 'no-release', manual, updateAvailable: false })
      }

      const latestVersion = normalizeVersion(updateInfo.version)
      const updateAvailable = compareVersions(latestVersion, this.currentVersion) > 0
      if (!updateAvailable) {
        this.info = null
        return this.emitStatus({ status: 'up-to-date', manual, updateAvailable: false, latestVersion })
      }

      const notes = Array.isArray(updateInfo.releaseNotes)
        ? updateInfo.releaseNotes.map((item) => item.note || '').join('\n')
        : String(updateInfo.releaseNotes || '')
      this.info = {
        installed: true,
        latestVersion,
        releaseNotes: notes,
        releaseName: updateInfo.releaseName || '',
        releaseDate: updateInfo.releaseDate || ''
      }
      return this.emitStatus({
        status: 'available',
        updateAvailable: true,
        manual,
        latestVersion,
        releaseNotes: notes,
        releaseName: updateInfo.releaseName || '',
        assetName: 'NSIS installer',
        assetType: 'installer'
      })
    } catch (error) {
      this.info = null
      const aborted = error && error.name === 'AbortError'
      return this.emitStatus({
        status: 'error',
        updateAvailable: false,
        manual,
        latestVersion: '',
        errorCode: aborted ? 'TIMEOUT' : 'CHECK_FAILED',
        error: error && error.message ? error.message : String(error)
      })
    } finally {
      this.checking = false
    }
  }

  async downloadInstalledUpdate({ prepareForUpdate } = {}) {
    if (!this.info || !this.info.installed) {
      return { ok: false, errorCode: 'NO_UPDATE', error: 'No update is available' }
    }

    const autoUpdater = getInstalledAutoUpdater()
    const onProgress = (progress) => {
      this.emitStatus({
        status: 'downloading',
        progress: Math.max(0, Math.min(99, Math.round(progress.percent || 0))),
        downloadedBytes: progress.transferred || 0,
        totalBytes: progress.total || 0,
        bytesPerSecond: progress.bytesPerSecond || 0,
        assetType: 'installer',
        fallback: false
      })
    }

    autoUpdater.on('download-progress', onProgress)
    try {
      this.emitStatus({
        status: 'downloading',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
        assetType: 'installer',
        fallback: false,
        error: '',
        errorCode: ''
      })
      await autoUpdater.downloadUpdate()
      this.emitStatus({ status: 'installing', progress: 100, assetType: 'installer' })
      if (typeof prepareForUpdate === 'function') prepareForUpdate()
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 300)
      return { ok: true }
    } catch (error) {
      const errorCode = error && error.code ? error.code : 'UPDATE_FAILED'
      const message = error && error.message ? error.message : String(error)
      this.emitStatus({ status: 'error', errorCode, error: message })
      return { ok: false, errorCode, error: message }
    } finally {
      autoUpdater.removeListener('download-progress', onProgress)
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
    if (this.isInstalledBuild()) return this.checkInstalledUpdates({ manual })
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
      const patchAsset = asset ? this.selectPatchAsset(assets, latestVersion) : null
      const patchChecksumAsset = patchAsset ? this.selectChecksumAsset(assets, patchAsset, latestVersion) : null

      this.info = updateAvailable && asset
        ? {
            tagName: release.tag_name,
            latestVersion,
            releaseNotes: String(release.body || '').slice(0, 4000),
            publishedAt: release.published_at || '',
            asset,
            checksumAsset,
            patchAsset,
            patchChecksumAsset
          }
        : null

      return this.emitStatus({
        status: updateAvailable ? 'available' : 'up-to-date',
        updateAvailable,
        manual,
        latestVersion,
        releaseNotes: String(release.body || '').slice(0, 4000),
        assetName: asset?.name || '',
        hasChecksum: !!(asset?.digest || checksumAsset),
        hasPatch: !!patchAsset,
        patchName: patchAsset?.name || '',
        patchSize: patchAsset?.size || 0
      })
    } catch (error) {
      const aborted = error && error.name === 'AbortError'
      this.info = null
      return this.emitStatus({
        status: 'error',
        updateAvailable: false,
        latestVersion: '',
        releaseNotes: '',
        assetName: '',
        hasPatch: false,
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
    const portableAssets = exeAssets.filter((asset) => /portable|便携版/i.test(asset.name || ''))
    return portableAssets.find((asset) => String(asset.name).includes(latestVersion))
      || portableAssets[0]
      || null
  }

  selectChecksumAsset(assets, asset, latestVersion) {
    const expectedName = `${asset.name}.sha256`.toLowerCase()
    return assets.find((item) => String(item.name || '').toLowerCase() === expectedName)
      || assets.find((item) => /sha256/i.test(item.name || '') && String(item.name).includes(latestVersion))
      || null
  }

  selectPatchAsset(assets, latestVersion) {
    const expectedName = `DesktopTODO-${this.currentVersion}-to-${latestVersion}-portable.patch.zst`.toLowerCase()
    return assets.find((asset) => String(asset.name || '').toLowerCase() === expectedName) || null
  }

  async expectedSha256(asset = this.info?.asset, checksumAsset = this.info?.checksumAsset) {
    if (!asset) return ''
    if (asset.digest && String(asset.digest).startsWith('sha256:')) {
      return String(asset.digest).slice('sha256:'.length).toLowerCase()
    }
    if (!checksumAsset) return ''
    const response = await fetchWithTimeout(checksumAsset.browser_download_url, {
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

  async downloadAndInstall({ quitForUpdate, prepareForUpdate, forceFull = false } = {}) {
    if (this.isInstalledBuild()) return this.downloadInstalledUpdate({ prepareForUpdate })
    if (!this.info || !this.info.asset) {
      return { ok: false, errorCode: 'NO_UPDATE', error: 'No update is available' }
    }

    const targetExe = this.portableExecutablePath()
    if (!targetExe) {
      const error = 'Automatic replacement is only available in the portable EXE build'
      this.emitStatus({ status: 'error', errorCode: 'PORTABLE_ONLY', error })
      return { ok: false, errorCode: 'PORTABLE_ONLY', error }
    }

    const usingPatch = !forceFull && !!this.info.patchAsset
    const asset = usingPatch ? this.info.patchAsset : this.info.asset
    const checksumAsset = usingPatch ? this.info.patchChecksumAsset : this.info.checksumAsset
    const downloadPath = usingPatch
      ? path.join(app.getPath('temp'), `DesktopTODO-update-${this.info.latestVersion}.patch.zst`)
      : path.join(app.getPath('temp'), `DesktopTODO-update-${this.info.latestVersion}.exe`)
    const partialPath = `${downloadPath}.part`

    try {
      const fullExpectedHash = await this.expectedSha256(this.info.asset, this.info.checksumAsset)
      if (!fullExpectedHash) throw Object.assign(new Error('Release checksum is missing'), { code: 'MISSING_CHECKSUM' })
      const expectedHash = usingPatch
        ? await this.expectedSha256(asset, checksumAsset)
        : fullExpectedHash
      if (!expectedHash) throw Object.assign(new Error('Patch checksum is missing'), { code: 'MISSING_CHECKSUM' })

      this.emitStatus({
        status: 'downloading',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: Number(asset.size) || 0,
        bytesPerSecond: 0,
        assetType: usingPatch ? 'patch' : 'full',
        fallback: false,
        error: '',
        errorCode: ''
      })
      const response = await fetchWithTimeout(asset.browser_download_url, {
        headers: { Accept: 'application/octet-stream' }
      }, 30 * 60 * 1000)
      if (!response.ok) throw new Error(`GitHub ${response.status}`)

      const total = Number(response.headers.get('content-length')) || Number(asset.size) || 0
      const handle = await fs.promises.open(partialPath, 'w')
      const hash = crypto.createHash('sha256')
      let received = 0
      let lastEmit = 0
      let lastBytes = 0
      let lastTime = Date.now()
      try {
        for await (const chunk of response.body) {
          await handle.write(chunk)
          hash.update(chunk)
          received += chunk.length
          const progress = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0
          const now = Date.now()
          if (now - lastEmit >= 180) {
            const elapsed = Math.max(1, now - lastTime)
            const bytesPerSecond = Math.round(((received - lastBytes) * 1000) / elapsed)
            this.emitStatus({
              status: 'downloading',
              progress,
              downloadedBytes: received,
              totalBytes: total,
              bytesPerSecond,
              assetType: usingPatch ? 'patch' : 'full',
              fallback: false
            })
            lastEmit = now
            lastBytes = received
            lastTime = now
          }
        }
      } finally {
        await handle.close()
      }

      const actualHash = hash.digest('hex').toLowerCase()
      if (actualHash !== expectedHash) {
        throw Object.assign(new Error('Downloaded file checksum does not match'), { code: 'CHECKSUM_MISMATCH' })
      }

      let installedPath = downloadPath
      if (usingPatch) {
        const patchedPath = path.join(app.getPath('temp'), `DesktopTODO-update-${this.info.latestVersion}.exe`)
        try {
          this.emitStatus({ status: 'installing', progress: 100, assetType: 'patch' })
          await fs.promises.rm(patchedPath, { force: true })
          this.applyPatch(targetExe, partialPath, patchedPath)
          const patchedHash = await this.sha256File(patchedPath)
          if (patchedHash !== fullExpectedHash || !(await this.isWindowsExecutable(patchedPath))) {
            throw Object.assign(new Error('Patched executable failed verification'), { code: 'PATCH_MISMATCH' })
          }
          installedPath = patchedPath
          await fs.promises.rm(partialPath, { force: true })
        } catch (patchError) {
          await fs.promises.rm(partialPath, { force: true }).catch(() => {})
          await fs.promises.rm(patchedPath, { force: true }).catch(() => {})
          this.emitStatus({
            status: 'downloading',
            progress: 0,
            downloadedBytes: 0,
            assetType: 'full',
            fallback: true,
            error: '',
            errorCode: ''
          })
          await new Promise((resolve) => setTimeout(resolve, 600))
          return this.downloadAndInstall({ quitForUpdate, forceFull: true })
        }
      } else {
        if (!(await this.isWindowsExecutable(partialPath))) {
          throw Object.assign(new Error('Downloaded file is not a Windows executable'), { code: 'INVALID_EXE' })
        }
        await fs.promises.rm(downloadPath, { force: true })
        await fs.promises.rename(partialPath, downloadPath)
      }
      this.emitStatus({ status: 'installing', progress: 100 })

      this.spawnInstallHelper({ targetExe, downloadPath: installedPath })
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

  zstdExecutablePath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'bin', 'zstd.exe')
      : path.join(__dirname, '..', 'assets', 'bin', 'zstd.exe')
  }

  applyPatch(basePath, patchPath, outputPath) {
    const zstd = this.zstdExecutablePath()
    if (!fs.existsSync(zstd)) {
      throw Object.assign(new Error('Bundled zstd patch tool is missing'), { code: 'PATCH_TOOL_MISSING' })
    }
    const result = spawnSync(zstd, [
      '-d',
      '--patch-from=' + basePath,
      '--long=27',
      '-o', outputPath,
      patchPath,
      '-f',
      '-q'
    ], {
      windowsHide: true,
      encoding: 'utf8'
    })
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim()
      throw Object.assign(new Error(detail || 'Failed to apply update patch'), { code: 'PATCH_FAILED' })
    }
  }

  sha256File(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
    })
  }

  async isWindowsExecutable(filePath) {
    const handle = await fs.promises.open(filePath, 'r')
    try {
      const signature = Buffer.alloc(2)
      await handle.read(signature, 0, 2, 0)
      return signature.toString('ascii') === 'MZ'
    } finally {
      await handle.close()
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
