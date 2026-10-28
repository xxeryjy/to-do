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
const os = require('os')

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
  timer.settings = { work_min: '25', short_break_min: '5', long_break_min: '15', long_break_every: '3', delay_focus_min: '10' }
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
  assert(timer.stage === 'focus' && timer.awaitingFocusChoice, '工作段到点后应等待休息/延长选择')
  const beforeExtend = timer.totalMs
  timer.extendFocus()
  assert(timer.stage === 'focus' && timer.running && !timer.awaitingFocusChoice, '延长后应继续当前专注')
  assert(timer.totalMs === beforeExtend + 10 * 60 * 1000, '延长应累加设置中的 10 分钟')
  timer._onFocusFinished()
  assert(timer.awaitingFocusChoice, '延长到点后应再次询问')
  timer.finishFocusForRecording()
  assert(timer.stage === 'recording' && timer.recordingFor === 'focus', '选择休息后应进入 recording(focus)')
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
  timer.totalMs = 25 * 60 * 1000
  timer.remainMs = 10 * 60 * 1000
  timer.startedAt = Date.now() - 15 * 60 * 1000
  let earlyFocusDuration = 0
  timer.once('focusFinished', (payload) => { earlyFocusDuration = payload.durationMin })
  timer.endFocusEarlyForRecording()
  assert(timer.stage === 'recording' && timer.recordingFor === 'focus', '提前结束专注应进入记录页')
  assert(earlyFocusDuration === 15, '提前结束专注应按实际 15 分钟记录')
  timer.startBreak()
  timer.totalMs = 5 * 60 * 1000
  timer.remainMs = 3 * 60 * 1000
  timer.breakStartedAt = Date.now() - 2 * 60 * 1000
  let earlyBreakDuration = 0
  timer.once('breakFinished', (payload) => { earlyBreakDuration = payload.durationMin })
  timer.endBreakEarlyForRecording()
  assert(timer.stage === 'recording' && timer.recordingFor === 'break', '提前结束休息应进入记录页')
  assert(earlyBreakDuration === 2, '提前结束休息应按实际 2 分钟记录')
  timer._stopTicker()
  ok('状态机转移与轮次回绕正确')
} catch (e) {
  fail('状态机', e.message)
}

console.log('[smoke] 3) 主进程模块加载')
const mainModules = ['db', 'timer', 'mailer', 'auto-mail', 'secret', 'i18n', 'updater', 'notifications', 'ipc']
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

console.log('[smoke] 3.55) 更新版本比较')
try {
  const { compareVersions, normalizeVersion } = require(path.join(appDir, 'main', 'updater'))
  assert(normalizeVersion('v0.4.2') === '0.4.2', '版本号应移除 v 前缀')
  assert(compareVersions('0.4.0', '0.3.0') === 1, '更高版本应被识别')
  assert(compareVersions('v0.3.0', '0.3.0') === 0, '相同版本应被识别')
  assert(compareVersions('0.2.9', '0.3.0') === -1, '较低版本应被识别')
  const updater = require(path.join(appDir, 'main', 'updater'))
  const assets = [
    { name: 'DesktopTODO-0.4.0-便携版.exe', browser_download_url: 'https://example.invalid/app.exe' },
    { name: 'DesktopTODO-0.4.0-便携版.exe.sha256', browser_download_url: 'https://example.invalid/app.sha256' },
    { name: 'DesktopTODO-0.3.0-to-0.4.0-portable.patch.zst', browser_download_url: 'https://example.invalid/app.patch.zst' },
    { name: 'DesktopTODO-0.3.0-to-0.4.0-portable.patch.zst.sha256', browser_download_url: 'https://example.invalid/app.patch.sha256' }
  ]
  const portable = updater.selectPortableAsset(assets, '0.4.0')
  assert(portable && portable.name.endsWith('.exe'), '应识别便携 EXE 资产')
  assert(updater.selectChecksumAsset(assets, portable, '0.4.0'), '应识别 SHA256 资产')
  const originalCurrentVersion = updater.currentVersion
  updater.currentVersion = '0.3.0'
  const patch = updater.selectPatchAsset(assets, '0.4.0')
  updater.currentVersion = originalCurrentVersion
  assert(patch && patch.name.endsWith('.patch.zst'), '应识别版本差分补丁')

  const zstd = path.join(appDir, 'assets', 'bin', 'zstd.exe')
  assert(fs.existsSync(zstd), '应包含 zstd 补丁工具')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-todo-zstd-'))
  const oldFile = path.join(tempDir, 'old.bin')
  const newFile = path.join(tempDir, 'new.bin')
  const patchFile = path.join(tempDir, 'diff.zst')
  const outputFile = path.join(tempDir, 'output.bin')
  fs.writeFileSync(oldFile, Buffer.alloc(100000, 65))
  fs.writeFileSync(newFile, Buffer.concat([Buffer.alloc(50000, 65), Buffer.from('CHANGED'), Buffer.alloc(50000, 66)]))
  const compress = spawnSync(zstd, [`--patch-from=${oldFile}`, '-o', patchFile, newFile, '-f', '-q'])
  const decompress = spawnSync(zstd, ['-d', `--patch-from=${oldFile}`, '-o', outputFile, patchFile, '-f', '-q'])
  assert(compress.status === 0 && decompress.status === 0, 'zstd 补丁生成或还原失败')
  assert(fs.readFileSync(outputFile).equals(fs.readFileSync(newFile)), '补丁还原内容不一致')
  fs.rmSync(tempDir, { recursive: true, force: true })
  ok('语义版本比较正确')
} catch (e) {
  fail('更新版本比较', e.message)
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

console.log('[smoke] 3.7) 提示音资源')
try {
  const audio = fs.readFileSync(path.join(appDir, 'assets', 'notification.wav'))
  assert(audio.subarray(0, 4).toString('ascii') === 'RIFF', '提示音应为 WAV 文件')
  assert(audio.subarray(8, 12).toString('ascii') === 'WAVE', '提示音格式头错误')
  ok('通知提示音资源有效')
} catch (e) {
  fail('提示音资源', e.message)
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
