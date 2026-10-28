/**
 * 桌面 TODO · 主进程入口
 * 职责：创建主窗口 + 挂件窗口，注册 IPC，管理应用生命周期
 */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron')
const path = require('path')

// 无 GPU / 远程桌面环境下禁用硬件加速，避免 GPU 进程崩溃导致启动失败
app.disableHardwareAcceleration()
// 允许隐藏窗口播放计时结束提示音
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setAppUserModelId('com.desktoptodo.app')

const { registerIpc } = require('./ipc')
const timer = require('./timer')
const db = require('./db')
const autoMail = require('./auto-mail')
const i18n = require('./i18n')

// 开发模式（npm run dev）：跳过单实例锁，允许与已运行的便携版共存
const isDev = process.argv.includes('--dev')
if (!isDev) {
  // 防止多个实例（挂件置顶窗口重复打开会打架）
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      // 第二实例启动时，恢复最小化或托盘中的主窗口
      if (!mainWin) {
        createMainWindow()
        return
      }
      if (mainWin.isMinimized()) mainWin.restore()
      if (!mainWin.isVisible()) mainWin.show()
      mainWin.focus()
    })
  }
}

/** @type {BrowserWindow|null} 主窗口 */
let mainWin = null
/** @type {BrowserWindow|null} 挂件窗口 */
let widgetWin = null
/** @type {Tray|null} 系统托盘 */
let tray = null
/** @type {boolean} 是否正在退出（托盘菜单「退出」触发） */
let quitting = false

/**
 * 最小化到托盘：隐藏主窗口，挂件与计时继续运行
 */
function minimizeToTray() {
  if (mainWin) {
    mainWin.hide()
  }
}

/** 应用更新时真正退出进程，避免被“关闭到托盘”逻辑拦截 */
function quitForUpdate() {
  quitting = true
  app.quit()
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'))
  const language = db.getSetting('language', 'en')
  const text = (key) => i18n.t(language, key)
  tray = new Tray(icon)
  tray.setToolTip(text('tray.tooltip'))

  const menu = Menu.buildFromTemplate([
    { label: text('tray.show'), click: showMainWindow },
    { type: 'separator' },
    { label: text('tray.quit'), click: () => {
      quitting = true
      app.quit()
    } }
  ])
  tray.setContextMenu(menu)

  // 单击托盘图标 → 显示主窗口
  tray.on('click', showMainWindow)
}

/** 语言切换后重建托盘菜单，保证主进程界面同步更新 */
function refreshTrayLanguage() {
  if (!tray) return
  tray.destroy()
  tray = null
  createTray()
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 420,
    height: 780,
    resizable: false,
    frame: false, // 无边框（暗黑效率风自绘头部）
    backgroundColor: '#0B0C0F',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    show: false, // 先隐藏，ready-to-show 后再显示，避免白屏
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))

  mainWin.once('ready-to-show', () => mainWin.show())

  // 点击关闭 → 最小化到托盘（除非是托盘菜单「退出」触发的真退出）
  mainWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      minimizeToTray()
    }
  })

  mainWin.on('closed', () => {
    mainWin = null
  })
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

function positionWidgetWindow() {
  if (!widgetWin || widgetWin.isDestroyed()) return
  const display = mainWin && !mainWin.isDestroyed()
    ? screen.getDisplayMatching(mainWin.getBounds())
    : screen.getPrimaryDisplay()
  const area = display.workArea
  const [width, height] = widgetWin.getSize()
  const margin = 24
  const mainBounds = mainWin && !mainWin.isDestroyed() ? mainWin.getBounds() : null
  const candidates = [
    { x: area.x + area.width - width - margin, y: area.y + margin },
    { x: area.x + area.width - width - margin, y: area.y + area.height - height - margin },
    { x: area.x + margin, y: area.y + margin },
    { x: area.x + margin, y: area.y + area.height - height - margin }
  ]

  const target = candidates.find((position) => {
    if (!mainBounds) return true
    const overlapsMain = rangesOverlap(position.x, position.x + width, mainBounds.x, mainBounds.x + mainBounds.width)
      && rangesOverlap(position.y, position.y + height, mainBounds.y, mainBounds.y + mainBounds.height)
    return !overlapsMain
  }) || candidates[0]

  widgetWin.setPosition(Math.round(target.x), Math.round(target.y))
}

function createWidgetWindow() {
  widgetWin = new BrowserWindow({
    width: 170,
    height: 32,
    resizable: false,
    frame: false,
    transparent: true, // 圆角胶囊需要透明背景
    alwaysOnTop: true, // 常驻置顶
    skipTaskbar: true, // 不占任务栏
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  widgetWin.loadFile(path.join(__dirname, '..', 'renderer', 'widget.html'))

  widgetWin.once('ready-to-show', () => {
    positionWidgetWindow()
    widgetWin.show()
  })

  widgetWin.on('closed', () => {
    widgetWin = null
  })
}

/**
 * 打开/聚焦主窗口（挂件点击展开时调用）
 */
function showMainWindow() {
  if (!mainWin) {
    createMainWindow()
  } else {
    if (mainWin.isMinimized()) mainWin.restore()
    mainWin.show()
    mainWin.focus()
  }
}

app.whenReady().then(() => {
  db.init()          // 初始化数据库（建表）
  timer.init()       // 初始化计时器（加载设置里的时长参数）
  registerIpc({ showMainWindow, minimizeToTray, refreshTrayLanguage, quitForUpdate })

  createMainWindow()
  createWidgetWindow()
  createTray()
  autoMail.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// 全部窗口关闭时退出（挂件也关则退出；若只想退出主窗留挂件，此处按需求调整）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  autoMail.stop()
})

// 暴露给 IPC 层使用的辅助函数
module.exports = { showMainWindow, getMainWindow: () => mainWin, getWidgetWindow: () => widgetWin, positionWidgetWindow }
