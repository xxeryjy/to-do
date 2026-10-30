/**
 * 桌面 TODO · 全局自动化快捷键
 * 注册失败时不影响应用运行，渲染层仍保留应用内快捷键。
 */
const { globalShortcut, BrowserWindow } = require('electron')
const db = require('./db')

const SHORTCUTS = {
  nextRound: 'CommandOrControl+Shift+N',
  extendBreak: 'CommandOrControl+Shift+B',
  finishRecord: 'CommandOrControl+Shift+Enter'
}

function broadcast(action) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('automation:shortcut', action)
  }
}

function stop() {
  globalShortcut.unregisterAll()
}

function init() {
  stop()
  if (db.getSetting('shortcuts_enabled', '1') !== '1') return
  for (const [action, accelerator] of Object.entries(SHORTCUTS)) {
    const ok = globalShortcut.register(accelerator, () => broadcast(action))
    if (!ok) console.warn(`[shortcuts] 快捷键注册失败：${accelerator}`)
  }
}

module.exports = { init, stop, SHORTCUTS }
