/**
 * 桌面 TODO · 最小冒烟测试（非 CI，本地 `npm test` 用）
 *
 * 不在 Electron 运行时时，自动自举到 `ELECTRON_RUN_AS_NODE` 下重跑本文件，
 * 以便加载 better-sqlite3 与 electron 相关模块。
 *
 * 覆盖：
 *  1) better-sqlite3 能在 Electron 运行时加载（头号崩溃风险）
 *  2) 计时状态机核心转移（idle→focus→recording→break→recording→next focus，轮次回绕）
 *  3) 主进程模块可正常加载（无语法/引用错误）
 *  4) 渲染层脚本语法校验（node --check）
 */
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const appDir = path.join(__dirname, '..')
const electronExe = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe')

// 自举：非 electron 运行时则重跑（清掉会被 electron 拒绝的 NODE_OPTIONS）
if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_OVERRIDE_DIST_PATH
  env.ELECTRON_RUN_AS_NODE = '1'
  const r = spawnSync(electronExe, [__filename], {
    cwd: appDir,
    env,
    stdio: 'inherit'
  })
  process.exit(r.status === null ? 1 : r.status)
}

async function main() {
let failures = 0
function ok(name) { console.log('  ✓ ' + name) }
function fail(name, detail) { failures++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')) }
function assert(cond, msg) { if (!cond) throw new Error(msg) }

console.log('[smoke] 1) 原生模块加载')
try {
  require('better-sqlite3')
  ok('better-sqlite3 可在 Electron 运行时加载')
} catch (e) {
  fail('better-sqlite3 加载', e.message)
}

console.log('[smoke] 2) 计时状态机')
try {
  const timer = require(path.join(appDir, 'main', 'timer'))
  // 预置设置，避免触发 db；状态机转移不依赖 db
  timer.settings = { work_min: '25', short_break_min: '5', long_break_min: '15', long_break_every: '3' }
  assert(timer.stage === 'idle', '初始应为 idle')
  timer.startFocus()
  assert(timer.stage === 'focus', 'startFocus 后应为 focus')
  const guardedRemain = timer.remainMs
  const guardedStartedAt = timer.startedAt
  timer.startFocus(60)
  assert(timer.remainMs === guardedRemain, '运行中重复开始不得重置剩余时间')
  assert(timer.startedAt === guardedStartedAt, '运行中重复开始不得重置开始时间')
  assert(timer.settings.work_min === '25', '运行中预设不得覆盖当前时长')
  timer._onFocusFinished()
  assert(timer.stage === 'recording' && timer.recordingFor === 'focus', '工作段结束应进入 recording(focus)')
  timer.startBreak()
  assert(timer.stage === 'break', 'startBreak 后应为 break')
  timer._onBreakFinished()
  assert(timer.stage === 'recording' && timer.recordingFor === 'break', '休息结束应进入 recording(break)')
  const before = timer.phaseInRound
  timer.startNextFocus()
  assert(timer.stage === 'focus', 'startNextFocus 后应为 focus')
  assert(timer.phaseInRound === before + 1, 'phaseInRound 应 +1')
  // 轮次回绕：longBreakEvery=2，phase=2 → 应回绕到 1
  timer.settings.long_break_every = '2'
  timer.phaseInRound = 2
  timer.startNextFocus()
  assert(timer.phaseInRound === 1, 'phaseInRound 应在满 N 段时回绕到 1')
  timer._stopTicker()
  ok('状态机转移与轮次回绕正确')
} catch (e) {
  fail('状态机', e.message)
}

console.log('[smoke] 3) 主进程模块加载')
const mainModules = ['db', 'timer', 'mailer', 'auto-mail', 'secret', 'ipc']
for (const m of mainModules) {
  try {
    require(path.join(appDir, 'main', m))
    ok('require main/' + m)
  } catch (e) {
    fail('require main/' + m, e.message)
  }
}

console.log('[smoke] 3.5) 自动邮件调度工具')
try {
  const autoMail = require(path.join(appDir, 'main', 'auto-mail'))
  assert(autoMail.formatDateKey(new Date(2026, 0, 2, 12, 0, 0)) === '2026-01-02', '日期键格式错误')
  assert(autoMail.previousDateKey(new Date(2026, 0, 2, 12, 0, 0)) === '2026-01-01', '上一日计算错误')
  assert(autoMail.parseTime('18:30').hours === 18, '发送时间解析错误')
  assert(autoMail.parseTime('25:00') === null, '非法时间应拒绝')
  assert(autoMail.isAtOrAfterSchedule(new Date(2026, 0, 2, 18, 30), '18:30'), '到点判断错误')
  ok('日期、时间与到点判断正确')
} catch (e) {
  fail('自动邮件调度工具', e.message)
}

console.log('[smoke] 3.6) 自动邮件处理分支')
try {
  const { AutoMailScheduler } = require(path.join(appDir, 'main', 'auto-mail'))
  const settings = {}
  const records = new Map()
  const sentDates = []
  const dbMock = {
    getAllSettings: () => settings,
    getSetting: (key, fallback = '') => settings[key] ?? fallback,
    setSetting: (key, value) => { settings[key] = String(value) },
    getFocusSessionsByDate: (dateKey) => records.get(dateKey) || []
  }
  let nextResult = { ok: true }
  const mailerMock = {
    sendEmailForDate: async (dateKey) => {
      sentDates.push(dateKey)
      return nextResult
    }
  }
  const scheduler = new AutoMailScheduler({ db: dbMock, mailer: mailerMock })
  records.set('2026-01-02', [{ id: 1 }])

  await scheduler.processDate('2026-01-02', settings)
  assert(sentDates.length === 1 && settings.daily_mail_last_success_date === '2026-01-02', '成功后应记录日期')
  await scheduler.processDate('2026-01-02', settings)
  assert(sentDates.length === 1, '同一运行周期不应重复发送')

  await scheduler.processDate('2026-01-03', settings)
  assert(settings.daily_mail_last_skip_date === '2026-01-03', '无记录日期应标记跳过')

  records.set('2026-01-04', [{ id: 2 }])
  nextResult = { ok: false, error: 'SMTP 失败' }
  await scheduler.processDate('2026-01-04', settings)
  assert(settings.daily_mail_last_error === 'SMTP 失败', '失败原因应持久化')
  ok('成功、跳过、失败和防重复逻辑正确')
} catch (e) {
  fail('自动邮件处理分支', e.message)
}

console.log('[smoke] 4) 渲染层脚本语法校验')
const rendererDir = path.join(appDir, 'renderer', 'js')
const rendererFiles = []
;(function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (ent.name.endsWith('.js')) rendererFiles.push(p)
  }
})(rendererDir)
let nodeChecked = 0
let skipped = false
const checkEnv = { ...process.env }
delete checkEnv.NODE_OPTIONS
delete checkEnv.ELECTRON_RUN_AS_NODE
for (const f of rendererFiles) {
  const r = spawnSync('node', ['--check', f], { cwd: appDir, env: checkEnv })
  if (r.error) {
    fail('node --check ' + path.relative(appDir, f), 'node 不可用: ' + r.error.message)
    skipped = true
    break
  }
  if (r.status === 0) nodeChecked++
  else fail('node --check ' + path.relative(appDir, f), (r.stderr || '').toString().trim())
}
if (!skipped && nodeChecked === rendererFiles.length && rendererFiles.length) {
  ok('渲染层 ' + rendererFiles.length + ' 个脚本语法通过')
}

console.log('')
if (failures > 0) {
  console.log('[smoke] 失败 ' + failures + ' 项')
  process.exit(1)
} else {
  console.log('[smoke] 全部通过')
  process.exit(0)
}
}

main().catch((error) => {
  console.error('[smoke] 未捕获错误：', error)
  process.exit(1)
})
