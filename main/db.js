/**
 * 桌面 TODO · SQLite 数据层
 * 仅主进程使用（better-sqlite3 同步 API），渲染进程一律走 IPC。
 */
const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let db = null

/** 初始化：确保目录 + 建表 + 默认设置 */
function init() {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, 'desktop-todo.db'))
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT    NOT NULL DEFAULT 'focus',
      started_at   TEXT    NOT NULL,
      ended_at     TEXT    NOT NULL,
      duration_min INTEGER NOT NULL,
      content      TEXT,
      tag          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 默认设置（仅缺省时插入）
  const defaults = {
    work_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    long_break_every: '4',
    delay_focus_min: '10', // 专注结束后主动延长一轮的默认时长
    language: 'en', // 默认英文，可在设置中切换为中文
    qq_email: '',
    qq_auth_code: '',
    widget_top: '1',
    widget_show_play: '0', // 挂件是否显示暂停按钮（默认不显示）
    widget_show_time: '0', // 挂件是否显示时间（默认不显示）
    daily_mail_enabled: '0',
    daily_mail_time: '18:00',
    daily_mail_last_success_date: '',
    daily_mail_last_skip_date: '',
    daily_mail_last_error: '',
    schema_version: '2'
  }
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaults)) {
    insert.run(k, v)
  }
}

/* ---------- sessions ---------- */

/**
 * 保存一条工作段记录（focusFinished → 用户填写 → 保存）
 * @returns {number} 新记录 id
 */
function saveSession({ startedAt, endedAt, durationMin, content, tag }) {
  const stmt = db.prepare(`
    INSERT INTO sessions (type, started_at, ended_at, duration_min, content, tag)
    VALUES ('focus', ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    new Date(startedAt).toISOString(),
    new Date(endedAt).toISOString(),
    durationMin,
    content || null,
    tag || null
  )
  return info.lastInsertRowid
}

/**
 * 保存一条休息记录（休息开始 → 休息结束，可带内容/标签）
 * @returns {number} 新记录 id
 */
function saveBreak({ startedAt, endedAt, durationMin, content, tag }) {
  const stmt = db.prepare(`
    INSERT INTO sessions (type, started_at, ended_at, duration_min, content, tag)
    VALUES ('break', ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    new Date(startedAt).toISOString(),
    new Date(endedAt).toISOString(),
    durationMin,
    content || null,
    tag || null
  )
  return info.lastInsertRowid
}

/**
 * 手动添加一条记录（不经过计时器，直接入库）
 * @param {string} type 'focus' | 'break'
 * @param {number} [startedAt] 可选：开始时间戳，默认当前时刻
 */
function addManualRecord({ type = 'focus', startedAt, durationMin, content, tag }) {
  const start = startedAt ? new Date(startedAt) : new Date()
  const endedAt = new Date(start.getTime() + (durationMin || 0) * 60000)
  const stmt = db.prepare(`
    INSERT INTO sessions (type, started_at, ended_at, duration_min, content, tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    type,
    start.toISOString(),
    endedAt.toISOString(),
    durationMin,
    content || null,
    tag || null
  )
  return info.lastInsertRowid
}

/**
 * 编辑一条记录（仅内容/标签/时长，类型与时间不可改）
 */
function updateSession(id, { content, tag, durationMin }) {
  const info = db.prepare(`
    UPDATE sessions SET content = ?, tag = ?, duration_min = ? WHERE id = ?
  `).run(content || null, tag || null, durationMin, id)
  return info.changes > 0
}

/** 查询今日记录（focus 且本地日期 = 今天） */
function getTodaySessions() {
  return db.prepare(`
    SELECT * FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') = date('now', 'localtime')
    ORDER BY started_at DESC
  `).all()
}

/** 今日统计 { segs, minutes } */
function getTodayStats() {
  return db.prepare(`
    SELECT COUNT(*) AS segs,
           COALESCE(SUM(duration_min), 0) AS minutes
    FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') = date('now', 'localtime')
  `).get()
}

/** 今日休息次数（break 且本地日期 = 今天） */
function getTodayBreaks() {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM sessions
    WHERE type = 'break'
      AND date(started_at, 'localtime') = date('now', 'localtime')
  `).get().n
}

/** 查询指定本地日期的工作记录，供手动发送和自动发送复用 */
function getFocusSessionsByDate(dateKey) {
  return db.prepare(`
    SELECT * FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') = date(?)
    ORDER BY started_at ASC
  `).all(dateKey)
}

/** 指定本地日期的工作统计 */
function getFocusStatsByDate(dateKey) {
  return db.prepare(`
    SELECT COUNT(*) AS segs,
           COALESCE(SUM(duration_min), 0) AS minutes
    FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') = date(?)
  `).get(dateKey)
}

/**
 * 计算连续专注天数。
 * 今天已有记录时从今天开始；今天未记录时从昨天开始，当天结束前不清零。
 */
function getTodayStreak() {
  const rows = db.prepare(`
    SELECT DISTINCT date(started_at, 'localtime') AS day
    FROM sessions
    WHERE type = 'focus'
    ORDER BY day DESC
  `).all()
  const usedDays = new Set(rows.map((row) => row.day))
  const cursor = new Date()
  const todayKey = localDateKey(cursor)

  if (!usedDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (usedDays.has(localDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 本地日期字符串 YYYY-MM-DD */
function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 查找页：关键词 + 日期范围
 * @param {string} kw 关键词（匹配 content/tag），空串则不过滤
 * @param {string} range 'today' | 'yesterday' | 'week' | 'all'
 */
function searchSessions(kw = '', range = 'all') {
  const conds = []
  const params = {}

  if (kw) {
    conds.push('(content LIKE @kw OR tag LIKE @kw)')
    params.kw = `%${kw}%`
  }
  switch (range) {
    case 'today':
      conds.push("date(started_at, 'localtime') = date('now', 'localtime')")
      break
    case 'yesterday':
      conds.push("date(started_at, 'localtime') = date('now', 'localtime', '-1 day')")
      break
    case 'week': {
      // 本地周一为一周开始（SQLite strftime('%w') 周日=0，这里用周一起始）
      conds.push("date(started_at, 'localtime') >= date('now', 'localtime', '-' || (CAST(strftime('%w', 'now', 'localtime') AS INTEGER) + 6) % 7 || ' days')")
      break
    }
    case 'all':
    default:
      break
  }

  // 全部类型（工作段 + 休息段）都展示
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM sessions ${where} ORDER BY started_at DESC`).all(params)

  // 统计：总条数（全部）+ 专注分钟（仅工作段）
  const stats = {
    count: rows.length,
    minutes: rows
      .filter((r) => r.type === 'focus')
      .reduce((acc, r) => acc + (r.duration_min || 0), 0)
  }
  return { rows, stats }
}

/* ---------- settings ---------- */

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value))
}

/** 批量保存设置，避免逐项广播导致的 UI 状态回读竞争 */
function setSettings(values) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const apply = db.transaction((entries) => {
    for (const [key, value] of entries) stmt.run(key, String(value))
  })
  apply(Object.entries(values || {}))
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

module.exports = {
  init,
  saveSession,
  saveBreak,
  addManualRecord,
  updateSession,
  getTodaySessions,
  getTodayStats,
  getTodayBreaks,
  getFocusSessionsByDate,
  getFocusStatsByDate,
  getTodayStreak,
  localDateKey,
  searchSessions,
  getSetting,
  setSetting,
  setSettings,
  getAllSettings
}
