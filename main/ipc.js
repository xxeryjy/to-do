/**
 * 桌面 TODO · IPC 层
 * 注册全部渲染进程 → 主进程通道；计时器状态统一广播到所有窗口。
 */
const { app, ipcMain, BrowserWindow, shell } = require('electron')
const timer = require('./timer')
const db = require('./db')
const mailer = require('./mailer')
const autoMail = require('./auto-mail')
const secret = require('./secret')
const updater = require('./updater')
const notifications = require('./notifications')

/**
 * @param {{showMainWindow: Function, minimizeToTray: Function, refreshTrayLanguage: Function, quitForUpdate: Function, prepareForUpdate: Function}} deps 主进程依赖
 */
function registerIpc({ showMainWindow, minimizeToTray, refreshTrayLanguage, quitForUpdate, prepareForUpdate }) {
  /* ---------- 计时器 ---------- */

  ipcMain.handle('timer:set-duration', (_e, { minutes } = {}) => {
    timer.setFocusDuration(minutes)
    return timer.snapshot()
  })

  ipcMain.handle('timer:start', (_e, { minutes } = {}) => {
    timer.startFocus(minutes)
    return timer.snapshot()
  })

  ipcMain.handle('timer:pause', () => {
    timer.pause()
    return timer.snapshot()
  })

  ipcMain.handle('timer:resume', () => {
    timer.resume()
    return timer.snapshot()
  })

  ipcMain.handle('timer:stop', () => {
    timer.stopFocus()
    return timer.snapshot()
  })

  ipcMain.handle('timer:finish-focus', () => {
    timer.finishFocusForRecording()
    return timer.snapshot()
  })

  ipcMain.handle('timer:extend-focus', () => {
    timer.extendFocus()
    return timer.snapshot()
  })

  ipcMain.handle('timer:end-focus-early', () => {
    timer.endFocusEarlyForRecording()
    return timer.snapshot()
  })

  ipcMain.handle('timer:end-break-early', () => {
    timer.endBreakEarlyForRecording()
    return timer.snapshot()
  })

  ipcMain.handle('timer:finish-break', () => {
    timer.finishBreakForRecording()
    return timer.snapshot()
  })

  ipcMain.handle('timer:extend-break', () => {
    timer.extendBreak()
    return timer.snapshot()
  })

  ipcMain.handle('timer:skip-break', () => {
    timer.skipBreak()
    return timer.snapshot()
  })

  ipcMain.handle('timer:state', () => timer.snapshot())

  /* ---------- 记录 ---------- */

  ipcMain.handle('record:save', (_e, payload) => {
    // payload: { startedAt, durationMin, content, tag }
    const id = db.saveSession({
      startedAt: payload.startedAt,
      endedAt: Date.now(),
      durationMin: payload.durationMin,
      content: payload.content,
      tag: payload.tag
    })
    // 保存后自动进入休息
    timer.startBreak()
    return { id, state: timer.snapshot() }
  })

  ipcMain.handle('record:save-break', (_e, payload) => {
    // payload: { startedAt, durationMin, content, tag }
    const id = db.saveBreak({
      startedAt: payload.startedAt,
      endedAt: Date.now(),
      durationMin: payload.durationMin,
      content: payload.content,
      tag: payload.tag
    })
    // 休息记录保存后进入下一工作段
    timer.startNextFocus()
    return { id, state: timer.snapshot() }
  })

  ipcMain.handle('record:add-manual', (_e, payload) => {
    // payload: { type, startedAt, durationMin, content, tag } —— 手动添加，不干扰计时器
    const id = db.addManualRecord({
      type: payload.type,
      startedAt: payload.startedAt,
      durationMin: payload.durationMin,
      content: payload.content,
      tag: payload.tag
    })
    return { id }
  })

  ipcMain.handle('record:update', (_e, payload) => {
    // payload: { id, content, tag, durationMin } —— 编辑已有记录（类型与时间不可改）
    const ok = db.updateSession(payload.id, {
      content: payload.content,
      tag: payload.tag,
      durationMin: payload.durationMin
    })
    return { ok }
  })

  ipcMain.handle('record:get-today', () => {
    return {
      sessions: db.getTodaySessions(),
      stats: {
        ...db.getTodayStats(),
        breaks: db.getTodayBreaks(),
        streak: db.getTodayStreak()
      }
    }
  })

  ipcMain.handle('record:search', (_e, { kw = '', range = 'all' } = {}) => {
    return db.searchSessions(kw, range)
  })

  /* ---------- 设置 ---------- */

  ipcMain.handle('settings:get', () => {
    const all = db.getAllSettings()
    // 不把授权码密文回传渲染层（避免输入框显示乱码/被二次加密）
    if (all.qq_auth_code) all.qq_auth_code = ''
    return all
  })

  const applySettings = (values) => {
    const stored = {}
    for (const [key, value] of Object.entries(values || {})) {
      if (value === undefined) continue
      stored[key] = key === 'qq_auth_code' && value ? secret.encrypt(value) : value
    }

    // 先同步系统登录项，失败时不写入数据库，避免设置显示成功但实际未生效。
    if (Object.prototype.hasOwnProperty.call(stored, 'launch_at_login')) {
      app.setLoginItemSettings({
        openAtLogin: stored.launch_at_login === '1',
        path: process.execPath
      })
    }

    db.setSettings(stored)
    const keys = Object.keys(stored)

    if (keys.some((key) => ['work_min', 'short_break_min', 'long_break_min', 'long_break_every', 'delay_focus_min', 'break_extend_min'].includes(key))) {
      timer.refreshSettings()
    }
    if (keys.includes('language') && refreshTrayLanguage) {
      refreshTrayLanguage()
    }
    if (keys.some((key) => ['daily_mail_enabled', 'daily_mail_time'].includes(key))) {
      autoMail.refresh()
    }

    // 批量保存只广播一次，避免渲染层回读旧值并覆盖尚未保存的修改。
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', { keys })
      }
    }
    return { ok: true, keys }
  }

  ipcMain.handle('settings:set', (_e, { key, value }) => {
    return applySettings({ [key]: value })
  })

  ipcMain.handle('settings:set-many', (_e, values) => {
    return applySettings(values)
  })

  /* ---------- 邮件 ---------- */

  ipcMain.handle('mail:send', async () => {
    const result = await mailer.sendTodayEmail()
    return result
  })

  ipcMain.handle('mail:auto-status', () => autoMail.getStatus())

  /* ---------- 应用更新 ---------- */

  ipcMain.handle('update:check', (_e, options = {}) => updater.checkForUpdates(options))

  ipcMain.handle('update:download-install', () => updater.downloadAndInstall({ quitForUpdate, prepareForUpdate }))

  ipcMain.handle('app:open-release', () => shell.openExternal('https://github.com/xxeryjy/to-do/releases/latest'))

  /* ---------- 窗口 ---------- */

  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) win.minimize()
    return { ok: true }
  })

  ipcMain.on('window:move-by', (event, { dx = 0, dy = 0 } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    const [x, y] = win.getPosition()
    win.setPosition(Math.round(x + dx), Math.round(y + dy), false)
  })

  ipcMain.handle('window:close-to-tray', () => {
    // 渲染层点击关闭按钮 → 最小化到托盘（真正退出走托盘菜单）
    minimizeToTray()
    return { ok: true }
  })

  ipcMain.handle('widget:expand', () => {
    showMainWindow()
    return { ok: true }
  })

  ipcMain.handle('widget:toggle-top', (_e, { top }) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    if (win) {
      win.setAlwaysOnTop(!!top, 'screen-saver')
      db.setSetting('widget_top', top ? '1' : '0')
    }
    return { ok: true }
  })

  /* ---------- 计时器状态广播 ---------- */

  const broadcast = (state) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('timer:state', state)
      }
    }
  }

  const notifyTimerCompletion = (kind) => {
    // 主渲染进程播放自定义提示音，用户点击系统通知后再恢复窗口
    if (db.getSetting('notification_sound_enabled', '1') === '1') {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('timer:notification-sound')
        }
      }
    }
    notifications.showTimerNotification(kind, { onClick: showMainWindow })
  }

  timer.on('state', broadcast)
  updater.on('status', (payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('update:status', payload)
      }
    }
  })

  timer.on('focusAwaitingChoice', (payload) => {
    // 专注到点后保持当前窗口状态，通过系统通知和提示音提醒
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('timer:focus-awaiting-choice', payload)
      }
    }
    notifyTimerCompletion('focus')
  })

  timer.on('focusFinished', ({ startedAt }) => {
    // 计时结束：唤起主窗口进入记录填写，挂件收到同一事件
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('timer:focus-finished', { startedAt })
      }
    }
    showMainWindow()
  })

  timer.on('breakAwaitingChoice', (payload) => {
    // 休息到点后先询问是否继续，不立即跳转记录页
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('timer:break-awaiting-choice', payload)
      }
    }
    notifyTimerCompletion('break')
  })

  timer.on('breakFinished', (payload) => {
    // 透传 timer.js 算好的 { startedAt, durationMin }，别再清空成 {}（否则渲染层只能 now-startedAt 兜底）
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('timer:break-finished', payload)
      }
    }
  })

  autoMail.on('status', (payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('mail:auto-status', payload)
      }
    }
  })
}

module.exports = { registerIpc }
