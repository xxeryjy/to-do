/**
 * 桌面 TODO · 每日自动邮件调度器
 * 规则：
 * 1. 默认关闭，由用户设置发送时间。
 * 2. 当天无记录时跳过。
 * 3. 启动时补发上一自然日尚未处理的汇总。
 * 4. 同一自然日最多尝试一次；失败后下次启动再补发。
 */
const { EventEmitter } = require('events')
const db = require('./db')
const mailer = require('./mailer')

const CHECK_INTERVAL_MS = 30 * 1000
const STARTUP_DELAY_MS = 1500

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function previousDateKey(date = new Date()) {
  const previous = new Date(date)
  previous.setDate(previous.getDate() - 1)
  return formatDateKey(previous)
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '')
  if (!match) return null
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

function isAtOrAfterSchedule(now, timeValue) {
  const time = parseTime(timeValue)
  if (!time) return false
  return now.getHours() > time.hours
    || (now.getHours() === time.hours && now.getMinutes() >= time.minutes)
}

class AutoMailScheduler extends EventEmitter {
  constructor({ db: database = db, mailer: mailService = mailer } = {}) {
    super()
    this.db = database
    this.mailer = mailService
    this.interval = null
    this.startupTimer = null
    this.checking = false
    this.attemptedDates = new Set()
    this.currentDay = formatDateKey(new Date())
  }

  start() {
    this.stop()
    this.currentDay = formatDateKey(new Date())
    this.interval = setInterval(() => {
      this.check().catch((error) => this.recordError(error))
    }, CHECK_INTERVAL_MS)
    this.startupTimer = setTimeout(() => {
      this.check({ startup: true }).catch((error) => this.recordError(error))
    }, STARTUP_DELAY_MS)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.interval = null
    this.startupTimer = null
  }

  /** 设置变更后立即使新计划生效 */
  refresh() {
    // 保留本进程内的尝试记录，避免修改设置导致失败后在同一运行周期重试。
    this.check().catch((error) => this.recordError(error))
  }

  async check({ startup = false } = {}) {
    if (this.checking) return
    const settings = this.db.getAllSettings()
    if (settings.daily_mail_enabled !== '1') return
    if (!parseTime(settings.daily_mail_time)) return

    this.checking = true
    try {
      const now = new Date()
      const today = formatDateKey(now)

      if (startup) {
        await this.processDate(previousDateKey(now), settings)
      } else if (today !== this.currentDay) {
        // 应用跨天运行时，补处理刚刚结束的上一自然日。
        await this.processDate(previousDateKey(now), settings)
      }
      this.currentDay = today

      if (isAtOrAfterSchedule(now, settings.daily_mail_time)) {
        await this.processDate(today, settings)
      }
    } finally {
      this.checking = false
    }
  }

  async processDate(dateKey, settings) {
    if (!dateKey) return
    if (this.attemptedDates.has(dateKey)) return
    if (this.db.getSetting('daily_mail_last_success_date', '') === dateKey) return
    if (this.db.getSetting('daily_mail_last_skip_date', '') === dateKey) return

    this.attemptedDates.add(dateKey)
    const sessions = this.db.getFocusSessionsByDate(dateKey)

    if (!sessions.length) {
      this.db.setSetting('daily_mail_last_skip_date', dateKey)
      this.db.setSetting('daily_mail_last_error', '')
      this.emit('status', { type: 'skipped', date: dateKey })
      return
    }

    const result = await this.mailer.sendEmailForDate(dateKey)
    if (result.ok) {
      this.db.setSetting('daily_mail_last_success_date', dateKey)
      this.db.setSetting('daily_mail_last_error', '')
      this.emit('status', { type: 'success', date: dateKey })
      return
    }

    if (result.skipped) {
      this.db.setSetting('daily_mail_last_skip_date', dateKey)
      this.db.setSetting('daily_mail_last_error', '')
      this.emit('status', { type: 'skipped', date: dateKey })
      return
    }

    this.recordError(new Error(result.error || '自动发送失败'), dateKey)
  }

  recordError(error, dateKey = formatDateKey(new Date())) {
    const message = error && error.message ? error.message : String(error)
    this.db.setSetting('daily_mail_last_error', message)
    this.emit('status', { type: 'error', date: dateKey, error: message })
  }

  getStatus() {
    const settings = this.db.getAllSettings()
    return {
      enabled: settings.daily_mail_enabled === '1',
      time: settings.daily_mail_time || '18:00',
      lastSuccessDate: settings.daily_mail_last_success_date || '',
      lastSkipDate: settings.daily_mail_last_skip_date || '',
      lastError: settings.daily_mail_last_error || ''
    }
  }
}

const scheduler = new AutoMailScheduler()
module.exports = scheduler
module.exports.AutoMailScheduler = AutoMailScheduler
module.exports.formatDateKey = formatDateKey
module.exports.previousDateKey = previousDateKey
module.exports.parseTime = parseTime
module.exports.isAtOrAfterSchedule = isAtOrAfterSchedule
