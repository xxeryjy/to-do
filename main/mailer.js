/**
 * 桌面 TODO · 邮件发送
 * 手动发送与自动发送共用同一套汇总内容和 QQ SMTP 配置。
 */
const nodemailer = require('nodemailer')
const db = require('./db')
const secret = require('./secret')
const i18n = require('./i18n')

/**
 * 把指定日期的工作记录汇总为纯文本。
 * @param {Array} sessions 工作记录
 * @returns {string} 邮件正文
 */
function buildDateBody(sessions, language = 'en') {
  const lines = []
  const locale = i18n.locale(language)
  for (const session of sessions) {
    const start = new Date(session.started_at).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    })
    const end = new Date(session.ended_at).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    })
    const tag = session.tag ? `[${i18n.tag(language, session.tag)}] ` : ''
    lines.push(`- ${start}-${end} ${tag}${session.content || ''}`)
  }
  return lines.join('\n')
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 发送指定本地日期的汇总邮件。
 * @param {string} dateKey YYYY-MM-DD
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
async function sendEmailForDate(dateKey) {
  const email = db.getSetting('qq_email', '')
  const authCode = secret.decrypt(db.getSetting('qq_auth_code', ''))
  const language = db.getSetting('language', 'en')
  const text = (key, vars) => i18n.t(language, key, vars)

  if (!email || !authCode) {
    return { ok: false, error: text('mail.missingConfig') }
  }

  const sessions = db.getFocusSessionsByDate(dateKey)
  if (sessions.length === 0) {
    const isToday = dateKey === db.localDateKey()
    return {
      ok: false,
      skipped: true,
      error: isToday
        ? text('mail.noToday')
        : text('mail.noDate', { date: dateKey })
    }
  }

  const stats = db.getFocusStatsByDate(dateKey)
  const dateLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString(i18n.locale(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
  const body = `${buildDateBody(sessions, language)}\n\n${text('mail.summary', {
    segments: stats.segs,
    minutes: stats.minutes
  })}`

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user: email, pass: authCode }
  })

  try {
    await transporter.sendMail({
      from: `${language === 'zh' ? '桌面TODO' : 'Desktop TODO'} <${email}>`,
      to: email,
      subject: text('mail.subject', { date: dateLabel }),
      text: body
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

/** 手动发送今日汇总 */
async function sendTodayEmail() {
  return sendEmailForDate(db.localDateKey())
}

/** 发送最近 7 个自然日的汇总邮件 */
async function sendWeeklyEmail(referenceDate = new Date()) {
  const email = db.getSetting('qq_email', '')
  const authCode = secret.decrypt(db.getSetting('qq_auth_code', ''))
  const language = db.getSetting('language', 'en')
  const text = (key, vars) => i18n.t(language, key, vars)
  if (!email || !authCode) return { ok: false, error: text('mail.missingConfig') }

  const end = new Date(referenceDate)
  const start = new Date(referenceDate)
  start.setDate(start.getDate() - 6)
  const startKey = formatDateKey(start)
  const endKey = formatDateKey(end)
  const sessions = db.getFocusSessionsBetween(startKey, endKey)
  if (!sessions.length) return { ok: false, skipped: true, error: text('mail.weeklyNoData') }

  const groups = new Map()
  for (const session of sessions) {
    const key = formatDateKey(new Date(session.started_at))
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(session)
  }
  const bodyParts = []
  for (const [dateKey, items] of groups) {
    const label = new Date(`${dateKey}T12:00:00`).toLocaleDateString(i18n.locale(language), {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
    bodyParts.push(`${label}\n${buildDateBody(items, language)}`)
  }
  const stats = db.getFocusStatsBetween(startKey, endKey)
  const body = `${bodyParts.join('\n\n')}\n\n${text('mail.weeklySummary', {
    segments: stats.segs,
    minutes: stats.minutes
  })}`
  const subject = text('mail.weeklySubject', { start: startKey, end: endKey })
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com', port: 465, secure: true,
    auth: { user: email, pass: authCode }
  })
  try {
    await transporter.sendMail({
      from: `${language === 'zh' ? '桌面TODO' : 'Desktop TODO'} <${email}>`,
      to: email,
      subject,
      text: body
    })
    return { ok: true, startKey, endKey }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

module.exports = {
  sendTodayEmail,
  sendEmailForDate,
  sendWeeklyEmail,
  buildDateBody,
  buildTodayBody: buildDateBody
}
