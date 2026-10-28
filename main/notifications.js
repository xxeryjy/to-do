/**
 * 桌面 TODO · 系统通知
 * 计时到点时通过 Windows 通知中心提醒；点击通知后恢复主窗口。
 */
const { Notification } = require('electron')
const path = require('path')
const db = require('./db')
const i18n = require('./i18n')

/** 显示专注或休息结束通知 */
function showTimerNotification(kind, { onClick } = {}) {
  if (!Notification.isSupported()) return { shown: false }

  const language = db.getSetting('language', 'en')
  const focus = kind === 'focus'
  const notification = new Notification({
    title: i18n.t(language, focus ? 'notification.focusTitle' : 'notification.breakTitle'),
    body: i18n.t(language, focus ? 'notification.focusBody' : 'notification.breakBody'),
    icon: path.join(__dirname, '..', 'assets', 'logo-mark-256.png'),
    silent: true
  })

  if (typeof onClick === 'function') notification.on('click', onClick)
  notification.show()
  return { shown: true }
}

module.exports = { showTimerNotification }
