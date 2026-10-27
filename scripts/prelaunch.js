/**
 * prelaunch · 安装期原生模块体检
 * 作为 npm `postinstall` 钩子运行：克隆后 `npm install` 结束时自动校验
 * better-sqlite3 是否匹配当前 Electron ABI，不匹配则自动重编。
 * 让"忘了 rebuild"在克隆那一刻就被掐死，无需手动 `npm run rebuild`。
 *
 * 注：挂在 postinstall 而非 preinstall——preinstall 跑的时候依赖还没装上，
 * 根本无从检测；postinstall 才是依赖刚装完、刚克隆完的正确时机。
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const appDir = __dirname
const electronExe = path.join(appDir, '..', 'node_modules', 'electron', 'dist', 'electron.exe')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
delete env.ELECTRON_OVERRIDE_DIST_PATH

/**
 * 用 Electron 自身运行时（ELECTRON_RUN_AS_NODE）尝试加载 better-sqlite3。
 * 原生模块 ABI 不匹配时会抛错，进程非 0 退出 → 返回 false。
 * 注意：better-sqlite3 在原生 .node 缺失时 require 不一定抛错（有静默兜底），
 * 故先显式检查绑定文件是否存在，缺失直接判定需重建。
 */
function checkBinding() {
  const bindingPath = path.join(appDir, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (!fs.existsSync(bindingPath)) return Promise.resolve(false) // 绑定缺失 → 需重建
  if (!fs.existsSync(electronExe)) return Promise.resolve(false) // electron 未装，交给后续安装
  return new Promise((resolve) => {
    const test = spawn(
      electronExe,
      ['-e', "require('better-sqlite3'); process.exit(0)"],
      { cwd: appDir, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore' }
    )
    test.on('error', () => resolve(false))
    test.on('exit', (code) => resolve(code === 0))
  })
}

/** 执行 npm run rebuild 重编 better-sqlite3 匹配当前 Electron */
function runRebuild() {
  return new Promise((resolve, reject) => {
    console.log('[prelaunch] better-sqlite3 未匹配 Electron，自动重建中…')
    const rb = spawn('npm', ['run', 'rebuild'], { cwd: appDir, env, stdio: 'inherit', shell: true })
    rb.on('error', reject)
    rb.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('rebuild 失败，退出码 ' + code))))
  })
}

;(async () => {
  let ok = false
  try {
    ok = await checkBinding()
  } catch (e) {
    ok = false
  }

  if (ok) {
    console.log('[prelaunch] better-sqlite3 已匹配 Electron，跳过重建。')
    return
  }

  try {
    await runRebuild()
  } catch (e) {
    console.error('[prelaunch] 自动重建失败：', e.message)
    process.exit(1)
  }
})()
