/**
 * 桌面 TODO · 邮件发送
 * 手动发送与自动发送共用同一套汇总内容和 QQ SMTP 配置。
 */
const nodemailer = require('nodemailer')
const db = require('./db')
const secret = require('./secret')

/**
 * 把指定日期的工作记录汇总为纯文本。
 * @param {Array} sessions 工作记录
 * @returns {string} 邮件正文
 */
function buildDateBody(sessions) {
  const lines = []
  for (const session of sessions) {
    const start = new Date(session.started_at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    const end = new Date(session.ended_at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    const tag = session.tag ? `[${session.tag}] ` : ''
    lines.push(`- ${start}-${end} ${tag}${session.content || ''}`)
  }
  return lines.join('\n')
}

/**
 * 发送指定本地日期的汇总邮件。
 * @param {string} dateKey YYYY-MM-DD
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
async function sendEmailForDate(dateKey) {
  const email = db.getSetting('qq_email', '')
  const authCode = secret.decrypt(db.getSetting('qq_auth_code', ''))

  if (!email || !authCode) {
    return { ok: false, error: '尚未在设置中填写 QQ 邮箱和授权码' }
  }

  const sessions = db.getFocusSessionsByDate(dateKey)
  if (sessions.length === 0) {
    const isToday = dateKey === db.localDateKey()
    return {
      ok: false,
      skipped: true,
      error: isToday ? '今日还没有任何工作记录' : `${dateKey} 没有工作记录`
    }
  }

  const stats = db.getFocusStatsByDate(dateKey)
  const dateLabel = new Date(`${dateKey}T12:00:00`).toLocaleDateString('zh-CN')
  const body = `${buildDateBody(sessions)}\n\n总计 ${stats.segs} 个工作段，专注 ${stats.minutes} 分钟。`

  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: { user: email, pass: authCode }
  })

  try {
    await transporter.sendMail({
      from: `桌面TODO <${email}>`,
      to: email,
      subject: `工作记录 ${dateLabel}`,
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

module.exports = {
  sendTodayEmail,
  sendEmailForDate,
  buildDateBody,
  buildTodayBody: buildDateBody
}
