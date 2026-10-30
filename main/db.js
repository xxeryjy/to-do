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
    CREATE TABLE IF NOT EXISTS tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'open',
      created_at   TEXT    NOT NULL,
      completed_at TEXT,
      estimate_min INTEGER,
      project      TEXT,
      scheduled_start TEXT,
      scheduled_end   TEXT,
      source       TEXT NOT NULL DEFAULT 'local',
      external_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT    NOT NULL DEFAULT 'focus',
      started_at   TEXT    NOT NULL,
      ended_at     TEXT    NOT NULL,
      duration_min INTEGER NOT NULL,
      content      TEXT,
      tag          TEXT,
      task_id      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // 旧数据库迁移：为已有记录表补充任务关联字段
  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all()
  if (!sessionColumns.some((column) => column.name === 'task_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN task_id INTEGER')
  }
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all()
  const taskMigrations = {
    estimate_min: 'INTEGER',
    project: 'TEXT',
    scheduled_start: 'TEXT',
    scheduled_end: 'TEXT',
    source: "TEXT NOT NULL DEFAULT 'local'",
    external_id: 'TEXT'
  }
  for (const [column, definition] of Object.entries(taskMigrations)) {
    if (!taskColumns.some((item) => item.name === column)) {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${definition}`)
    }
  }

  // 默认设置（仅缺省时插入）
  const defaults = {
    work_min: '25',
    short_break_min: '5',
    long_break_min: '15',
    long_break_every: '4',
    delay_focus_min: '10', // 专注结束后主动延长一轮的默认时长
    break_extend_min: '5', // 休息结束后主动延长一轮的默认时长
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
    ui_style: 'dark', // UI 主题：dark / candy / light
    launch_at_login: '0', // 开机启动默认关闭
    notifications_enabled: '1', // 计时结束系统通知
    notification_sound_enabled: '1', // 计时结束提示音
    automation_draft_enabled: '1', // 专注结束后生成可编辑记录草稿
    automation_task_mapping_enabled: '1', // 从任务带出标签与项目
    shortcuts_enabled: '1', // 应用内自动化快捷键
    focus_scene_enabled: '0', // 进入专注时执行场景动作
    focus_scene_dnd_enabled: '0', // 尝试切换 Windows 勿扰模式
    focus_launch_apps_enabled: '0', // 自动启动指定工作软件
    focus_launch_apps: '[]', // JSON 数组，保存本地可执行文件路径
    weekly_mail_enabled: '0',
    weekly_mail_day: '5', // 0=周日，1=周一 … 6=周六
    weekly_mail_time: '18:30',
    weekly_mail_last_success_week: '',
    weekly_mail_last_skip_week: '',
    weekly_mail_last_error: '',
    schema_version: '3'
  }
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaults)) {
    insert.run(k, v)
  }
  db.prepare("UPDATE settings SET value = '3' WHERE key = 'schema_version'").run()
}

/* ---------- sessions ---------- */

/**
 * 保存一条工作段记录（focusFinished → 用户填写 → 保存）
 * @returns {number} 新记录 id
 */
function saveSession({ startedAt, endedAt, durationMin, content, tag, taskId }) {
  const stmt = db.prepare(`
    INSERT INTO sessions (type, started_at, ended_at, duration_min, content, tag, task_id)
    VALUES ('focus', ?, ?, ?, ?, ?, ?)
  `)
  const info = stmt.run(
    new Date(startedAt).toISOString(),
    new Date(endedAt).toISOString(),
    durationMin,
    content || null,
    tag || null,
    taskId || null
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
    SELECT s.*, t.title AS task_title
    FROM sessions s
    LEFT JOIN tasks t ON t.id = s.task_id
    WHERE s.type = 'focus'
      AND date(s.started_at, 'localtime') = date('now', 'localtime')
    ORDER BY s.started_at DESC
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

/** 查询日期区间内的工作记录，供每周汇总使用（含起止日期） */
function getFocusSessionsBetween(startDateKey, endDateKey) {
  return db.prepare(`
    SELECT * FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') >= date(?)
      AND date(started_at, 'localtime') <= date(?)
    ORDER BY started_at ASC
  `).all(startDateKey, endDateKey)
}

function getFocusStatsBetween(startDateKey, endDateKey) {
  return db.prepare(`
    SELECT COUNT(*) AS segs,
           COALESCE(SUM(duration_min), 0) AS minutes
    FROM sessions
    WHERE type = 'focus'
      AND date(started_at, 'localtime') >= date(?)
      AND date(started_at, 'localtime') <= date(?)
  `).get(startDateKey, endDateKey)
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

/* ---------- tasks ---------- */

/** 新建一个只有名称的扁平任务 */
function createTask(input) {
  const payload = typeof input === 'string' ? { title: input } : (input || {})
  const value = String(payload.title || '').trim()
  if (!value) throw new Error('Task title is required')
  const project = String(payload.project || '').trim() || null
  const estimateMin = Math.max(1, Math.min(1440, parseInt(payload.estimateMin, 10) || 0)) || null
  const now = new Date().toISOString()
  const info = db.prepare(`
    INSERT INTO tasks (title, status, created_at, estimate_min, project)
    VALUES (?, 'open', ?, ?, ?)
  `).run(value, now, estimateMin, project)
  return getTaskById(info.lastInsertRowid)
}

function getTaskById(id) {
  return db.prepare(`
    SELECT t.*, COALESCE(SUM(CASE WHEN s.type = 'focus' THEN s.duration_min ELSE 0 END), 0) AS focus_minutes
    FROM tasks t
    LEFT JOIN sessions s ON s.task_id = t.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id)
}

/** 今日任务：所有未完成任务 + 今天完成的任务。 */
function getTodayTasks() {
  return db.prepare(`
    SELECT t.*,
           COALESCE(SUM(CASE WHEN s.type = 'focus' THEN s.duration_min ELSE 0 END), 0) AS focus_minutes,
           MAX(CASE WHEN s.type = 'focus' THEN s.ended_at END) AS last_focused_at
    FROM tasks t
    LEFT JOIN sessions s ON s.task_id = t.id
    WHERE t.status = 'open'
       OR date(t.completed_at, 'localtime') = date('now', 'localtime')
    GROUP BY t.id
    ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, t.created_at DESC
  `).all()
}

/** 勾选完成或重新打开任务 */
function setTaskCompleted(id, completed) {
  const status = completed ? 'done' : 'open'
  const completedAt = completed ? new Date().toISOString() : null
  const info = db.prepare(`
    UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?
  `).run(status, completedAt, id)
  return info.changes > 0 ? getTaskById(id) : null
}

/** 将任务拖入某一天的某个时间段 */
function setTaskSchedule(id, scheduledStart, scheduledEnd) {
  const start = scheduledStart ? new Date(scheduledStart) : null
  const end = scheduledEnd ? new Date(scheduledEnd) : null
  if (start && Number.isNaN(start.getTime())) throw new Error('Invalid schedule start')
  if (end && Number.isNaN(end.getTime())) throw new Error('Invalid schedule end')
  if (start && end && end <= start) throw new Error('Schedule end must be after start')
  const info = db.prepare(`
    UPDATE tasks SET scheduled_start = ?, scheduled_end = ? WHERE id = ?
  `).run(start ? start.toISOString() : null, end ? end.toISOString() : null, id)
  return info.changes > 0 ? getTaskById(id) : null
}

/** 按项目汇总本月专注投入 */
function getProjectStats() {
  return db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(t.project), ''), 'Unassigned') AS project,
           COALESCE(SUM(s.duration_min), 0) AS minutes,
           COUNT(s.id) AS sessions,
           COUNT(DISTINCT t.id) AS tasks
    FROM sessions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.type = 'focus'
      AND date(s.started_at, 'localtime') >= date('now', 'localtime', 'start of month')
    GROUP BY COALESCE(NULLIF(TRIM(t.project), ''), 'Unassigned')
    ORDER BY minutes DESC
  `).all()
}

/** 任务预估与实际投入偏差 */
function getEstimateBias() {
  return db.prepare(`
    SELECT t.id, t.title, t.project, t.estimate_min,
           COALESCE(SUM(s.duration_min), 0) AS actual_min
    FROM tasks t
    JOIN sessions s ON s.task_id = t.id AND s.type = 'focus'
    WHERE t.estimate_min IS NOT NULL
      AND date(s.started_at, 'localtime') >= date('now', 'localtime', 'start of month')
    GROUP BY t.id
    ORDER BY ABS(COALESCE(SUM(s.duration_min), 0) - t.estimate_min) DESC
  `).all()
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
  getFocusSessionsBetween,
  getFocusStatsBetween,
  getTodayStreak,
  localDateKey,
  searchSessions,
  createTask,
  getTaskById,
  getTodayTasks,
  setTaskCompleted,
  setTaskSchedule,
  getProjectStats,
  getEstimateBias,
  getSetting,
  setSetting,
  setSettings,
  getAllSettings
}
