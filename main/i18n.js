/**
 * 桌面 TODO · 主进程多语言文案
 * 托盘、邮件和主进程状态提示共用。
 */
const MESSAGES = {
  zh: {
    'tray.tooltip': '桌面 TODO',
    'tray.show': '显示主窗口',
    'tray.quit': '退出',
    'mail.missingConfig': '尚未在设置中填写 QQ 邮箱和授权码',
    'mail.noToday': '今日还没有任何工作记录',
    'mail.noDate': '{date} 没有工作记录',
    'mail.summary': '总计 {segments} 个工作段，专注 {minutes} 分钟。',
    'mail.subject': '工作记录 {date}',
    'mail.weeklySubject': '每周工作汇总 {start} 至 {end}',
    'mail.weeklySummary': '本周总计 {segments} 个工作段，专注 {minutes} 分钟。',
    'mail.weeklyNoData': '最近 7 天没有工作记录',
    'mail.autoFailed': '自动发送失败',
    'notification.focusTitle': '专注结束',
    'notification.focusBody': '你累了吗？点击打开应用，选择休息或继续专注。',
    'notification.breakTitle': '休息结束',
    'notification.breakBody': '点击打开应用，选择再休息一会儿或结束并记录。',
    'tag.code': '写代码',
    'tag.meeting': '开会',
    'tag.study': '学习',
    'tag.slacking': '摸鱼',
    'tag.water': '喝水',
    'tag.walk': '散步',
    'tag.phone': '刷手机',
    'tag.zoneOut': '发呆'
  },
  en: {
    'tray.tooltip': 'Desktop TODO',
    'tray.show': 'Show main window',
    'tray.quit': 'Quit',
    'mail.missingConfig': 'Add a QQ email address and SMTP password in Settings first',
    'mail.noToday': 'No work records today',
    'mail.noDate': 'No work records for {date}',
    'mail.summary': 'Total: {segments} work blocks, {minutes} minutes focused.',
    'mail.subject': 'Work log · {date}',
    'mail.weeklySubject': 'Weekly summary · {start} to {end}',
    'mail.weeklySummary': 'This week: {segments} work blocks, {minutes} minutes focused.',
    'mail.weeklyNoData': 'No work records in the last 7 days',
    'mail.autoFailed': 'Automatic email failed',
    'notification.focusTitle': 'Focus complete',
    'notification.focusBody': 'Are you tired? Open the app to take a break or keep focusing.',
    'notification.breakTitle': 'Break complete',
    'notification.breakBody': 'Open the app to rest a little longer or finish and record this break.',
    'tag.code': 'Coding',
    'tag.meeting': 'Meeting',
    'tag.study': 'Learning',
    'tag.slacking': 'Slacking',
    'tag.water': 'Water',
    'tag.walk': 'Walk',
    'tag.phone': 'Phone',
    'tag.zoneOut': 'Zone out'
  }
}

const TAG_KEYS = {
  '写代码': 'tag.code',
  '开会': 'tag.meeting',
  '学习': 'tag.study',
  '摸鱼': 'tag.slacking',
  '喝水': 'tag.water',
  '散步': 'tag.walk',
  '刷手机': 'tag.phone',
  '发呆': 'tag.zoneOut'
}

function normalizeLanguage(language) {
  return language === 'zh' ? 'zh' : 'en'
}

function locale(language) {
  return normalizeLanguage(language) === 'zh' ? 'zh-CN' : 'en-US'
}

function t(language, key, vars = {}) {
  const lang = normalizeLanguage(language)
  const template = MESSAGES[lang][key] || MESSAGES.en[key] || key
  return template.replace(/\{(\w+)\}/g, (_match, name) => (
    vars[name] === undefined ? `{${name}}` : String(vars[name])
  ))
}

function tag(language, value) {
  return TAG_KEYS[value] ? t(language, TAG_KEYS[value]) : value
}

module.exports = { t, tag, locale, normalizeLanguage }
