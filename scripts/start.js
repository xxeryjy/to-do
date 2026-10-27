/**
 * 桌面 TODO · 启动器
 * 兜底 WorkBuddy/IDE 注入的环境变量（ELECTRON_RUN_AS_NODE=1 会让 Electron
 * 退化成纯 Node 模式；NODE_OPTIONS 里的 --use-system-ca 不被 Electron 接受）。
 * 统一在启动前清除，保证任何环境下 `npm start` 都能正常跑。
 *
 * 启动前会自动校验 better-sqlite3 原生模块能否在 Electron 运行时加载；
 * 若未匹配 Electron ABI（常见于新克隆仓库 / 升级 Electron 后），自动执行
 * `npm run rebuild` 重编，避免首跑即崩在原生模块加载。
 */
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const electronExe = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
const appDir = path.join(__dirname, '..')

// 复制环境变量并剔除会破坏 Electron 的项
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
  const bindingPath = path.join(appDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (!fs.existsSync(bindingPath)) return Promise.resolve(false) // 绑定缺失 → 需重建
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
    console.log('[start] better-sqlite3 未匹配 Electron，自动重建中…')
    const rb = spawn('npm', ['run', 'rebuild'], { cwd: appDir, env, stdio: 'inherit', shell: true })
    rb.on('error', reject)
    rb.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('rebuild 失败，退出码 ' + code))))
  })
}

async function main() {
  const ok = await checkBinding()
  if (!ok) {
    try {
      await runRebuild()
    } catch (e) {
      console.error('[start] 自动重建失败：', e.message)
      process.exit(1)
    }
  }

  // 无 GPU/远程桌面环境下禁用硬件加速，避免 GPU 进程崩溃
  // 透传 npm 脚本附加参数（如 `npm run dev` 的 --dev），供主进程判断开发模式
  const extraArgs = process.argv.slice(2)
  const args = ['.', '--disable-gpu', '--in-process-gpu', ...extraArgs]

  const child = spawn(electronExe, args, {
    cwd: appDir,
    env,
    stdio: 'inherit'
  })

  child.on('exit', (code) => process.exit(code || 0))
  child.on('error', (err) => {
    console.error('启动 Electron 失败:', err.message)
    process.exit(1)
  })
}

main()
