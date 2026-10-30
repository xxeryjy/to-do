/**
 * 桌面 TODO · 专注场景自动化
 * 负责启动用户明确配置的本地工作软件；Windows 勿扰模式只做能力探测与降级提示。
 */
const fs = require('fs')
const { shell } = require('electron')

function parseApps(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
  } catch (_error) {
    return []
  }
}

async function applyFocusScene(settings = {}) {
  if (settings.focus_scene_enabled !== '1') return { enabled: false }

  const dndRequested = settings.focus_scene_dnd_enabled === '1'
  const launchEnabled = settings.focus_launch_apps_enabled === '1'
  const launched = []
  const failed = []

  if (launchEnabled) {
    const apps = [...new Set(parseApps(settings.focus_launch_apps))]
    for (const appPath of apps) {
      if (!fs.existsSync(appPath)) {
        failed.push(appPath)
        continue
      }
      const error = await shell.openPath(appPath)
      if (error) failed.push(appPath)
      else launched.push(appPath)
    }
  }

  return {
    enabled: true,
    dndRequested,
    dndSupported: false,
    launched,
    failed
  }
}

module.exports = { applyFocusScene, parseApps }
