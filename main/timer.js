/**
 * 桌面 TODO · 计时器核心
 * 全应用唯一的计时状态实例，挂在主进程，主窗口/挂件窗口共享。
 * 用 Date.now() 与结束时间戳求差值（防 setInterval 漂移 + 防休眠挂起）。
 */
const { EventEmitter } = require('events')
const db = require('./db')

const STAGE = {
  IDLE: 'idle',               // 空闲
  FOCUS: 'focus',             // 工作段计时
  BREAK: 'break',             // 休息计时
  RECORDING: 'recording'      // 工作段结束，等待填写记录
}

class Timer extends EventEmitter {
  constructor() {
    super()
    this.stage = STAGE.IDLE
    this.running = false          // false = 暂停
    this.phaseInRound = 1         // 本轮第几个工作段
    this.totalMs = 0
    this.remainMs = 0
    this.startedAt = null         // 本次开始时间戳（记录填写展示用）
    this.breakStartedAt = null    // 休息开始时间戳（写库用）
    this.recordingFor = null      // 当前 RECORDING 阶段属于 'focus' 还是 'break'
    this.taskId = null             // 当前专注关联的任务
    this.taskTitle = ''
    this.taskProject = ''
    this.recordingDurationMin = null
    this.awaitingFocusChoice = false // 专注到点后，等待用户选择休息或延长
    this.awaitingBreakChoice = false // 休息到点后，等待用户选择继续休息或记录
    this.endAt = null             // 计时结束时间戳
    this.interval = null
    this.settings = {}            // 时长参数缓存
  }

  /** 启动时调用：加载设置并广播初始状态 */
  init() {
    this.settings = db.getAllSettings()
    this._syncIdleDuration()
    this.emitState()
  }

  /** 设置变更后调用：空闲时同步显示新的计划时长 */
  refreshSettings() {
    this.settings = db.getAllSettings()
    if (this.stage === STAGE.IDLE) {
      this._syncIdleDuration()
      this.emitState()
    }
  }

  /** 空闲状态下同步计划时长与显示值 */
  _syncIdleDuration() {
    const duration = this.currentDurationMs()
    this.totalMs = duration
    this.remainMs = duration
  }

  /** 空闲时设置工作段时长，不启动计时 */
  setFocusDuration(minutes) {
    if (this.stage !== STAGE.IDLE) return false
    const value = Math.max(1, Math.min(120, parseInt(minutes, 10) || 25))
    this.settings.work_min = String(value)
    db.setSetting('work_min', String(value))
    this._syncIdleDuration()
    this.emitState()
    return true
  }

  /** 当前阶段的时长（毫秒） */
  currentDurationMs() {
    const min = this.stage === STAGE.BREAK
      ? (this.phaseInRound % this.longBreakEvery() === 0
        ? this.settings.long_break_min
        : this.settings.short_break_min)
      : this.settings.work_min
    return parseInt(min || 25, 10) * 60 * 1000
  }

  longBreakEvery() {
    return parseInt(this.settings.long_break_every || 4, 10)
  }

  /** 开始工作段：仅允许从空闲状态进入 */
  startFocus(minutes, taskId = null, taskTitle = '', taskProject = '') {
    if (this.stage !== STAGE.IDLE) return this.snapshot()
    if (minutes) this.setFocusDuration(minutes)
    this.taskId = taskId || null
    this.taskTitle = String(taskTitle || '')
    this.taskProject = String(taskProject || '')
    this._beginFocus()
    return this.snapshot()
  }

  /** 内部启动工作段，供开始、跳过休息和休息结束后复用 */
  _beginFocus() {
    this._stopTicker()
    this.stage = STAGE.FOCUS
    this.running = true
    this.recordingFor = null
    this.recordingDurationMin = null
    this.awaitingFocusChoice = false
    this.awaitingBreakChoice = false
    this.totalMs = this.currentDurationMs()
    this.remainMs = this.totalMs
    this.startedAt = Date.now()
    this._startTicker()
    this.emitState()
  }

  /** 暂停（工作段/休息通用） */
  pause() {
    if (!this.running || this.awaitingFocusChoice || this.awaitingBreakChoice) return
    this.running = false
    this._stopTicker()
    this.emitState()
  }

  /** 继续：仅允许继续已暂停的工作段或休息段 */
  resume() {
    if (this.running || this.awaitingFocusChoice || this.awaitingBreakChoice || this.stage === STAGE.IDLE || this.stage === STAGE.RECORDING) return
    this.running = true
    this._startTicker()
    this.emitState()
  }

  /** 结束当前工作段并丢弃（不写记录，直接进休息） */
  stopFocus() {
    if (this.stage !== STAGE.FOCUS) return
    this._stopTicker()
    this.awaitingFocusChoice = false
    this.awaitingBreakChoice = false
    this.taskId = null
    this.taskTitle = ''
    this.taskProject = ''
    this.stage = STAGE.BREAK
    this.running = true
    this.totalMs = this.currentDurationMs()
    this.remainMs = this.totalMs
    this.startedAt = Date.now()
    this.breakStartedAt = this.startedAt // 休息开始时间（写库用）
    this.emit('stageChanged', { from: 'focus', to: 'break', discarded: true })
    this._startTicker()
    this.emitState()
  }

  /** 工作段计时结束：先询问用户是否休息，暂不进入记录页 */
  _onFocusFinished() {
    this._stopTicker()
    this.running = false
    this.remainMs = 0
    this.awaitingFocusChoice = true
    this.awaitingBreakChoice = false
    this.emitState()
    this.emit('focusAwaitingChoice', {
      startedAt: this.startedAt,
      durationMin: Math.round(this.totalMs / 60000)
    })
  }

  /** 用户选择先休息：将当前专注转入记录页，保存记录后由 IPC 启动休息 */
  finishFocusForRecording() {
    if (this.stage !== STAGE.FOCUS || !this.awaitingFocusChoice) return this.snapshot()
    this.awaitingFocusChoice = false
    this.awaitingBreakChoice = false
    this.stage = STAGE.RECORDING
    this.recordingFor = 'focus'
    this.recordingDurationMin = Math.max(1, Math.round(this.totalMs / 60000))
    this.emitState()
    this.emit('focusFinished', {
      startedAt: this.startedAt,
      durationMin: Math.max(1, Math.round(this.totalMs / 60000))
    })
    return this.snapshot()
  }

  /** 用户选择继续：按设置时长延长当前专注，轮次保持不变 */
  extendFocus() {
    if (this.stage !== STAGE.FOCUS || !this.awaitingFocusChoice) return this.snapshot()
    const minutes = Math.max(1, Math.min(120, parseInt(this.settings.delay_focus_min || 10, 10)))
    const extraMs = minutes * 60 * 1000
    this.awaitingFocusChoice = false
    this.awaitingBreakChoice = false
    this.totalMs += extraMs
    this.remainMs = extraMs
    this.running = true
    this._startTicker()
    this.emitState()
    return this.snapshot()
  }

  /** 用户提前结束专注：按实际已进行时长进入记录页 */
  endFocusEarlyForRecording() {
    if (this.stage !== STAGE.FOCUS || this.awaitingFocusChoice) return this.snapshot()
    this._stopTicker()
    this.running = false
    this.awaitingBreakChoice = false
    const elapsedMs = Math.max(0, this.totalMs - this.remainMs)
    this.stage = STAGE.RECORDING
    this.recordingFor = 'focus'
    this.recordingDurationMin = Math.max(1, Math.round(elapsedMs / 60000))
    this.emitState()
    this.emit('focusFinished', {
      startedAt: this.startedAt,
      durationMin: Math.max(1, Math.round(elapsedMs / 60000))
    })
    return this.snapshot()
  }

  /** 记录保存后：进入休息 */
  startBreak() {
    this.awaitingFocusChoice = false
    this.awaitingBreakChoice = false
    this.taskId = null
    this.taskTitle = ''
    this.taskProject = ''
    this.recordingDurationMin = null
    this.stage = STAGE.BREAK
    this.running = true
    this.totalMs = this.currentDurationMs()
    this.remainMs = this.totalMs
    this.startedAt = Date.now()
    this.breakStartedAt = this.startedAt // 休息开始时间（写库用）
    this._startTicker()
    this.emitState()
  }

  /** 跳过休息：进入下一工作段 */
  skipBreak() {
    if (this.stage !== STAGE.BREAK || this.awaitingBreakChoice) return
    this._stopTicker()
    this._advanceRound()
    this._beginFocus()
  }

  /** 休息计时结束：先询问是否继续休息，暂不进入记录页 */
  _onBreakFinished() {
    this._stopTicker()
    this.running = false
    this.remainMs = 0
    this.awaitingBreakChoice = true
    this.emitState()
    this.emit('breakAwaitingChoice', {
      startedAt: this.breakStartedAt,
      durationMin: Math.max(1, Math.round(this.totalMs / 60000))
    })
  }

  /** 用户选择结束休息：进入记录页，整段延长时长合并为一条记录 */
  finishBreakForRecording() {
    if (this.stage !== STAGE.BREAK || !this.awaitingBreakChoice) return this.snapshot()
    this.awaitingBreakChoice = false
    this.stage = STAGE.RECORDING
    this.recordingFor = 'break'
    this.recordingDurationMin = Math.max(1, Math.round(this.totalMs / 60000))
    this.emitState()
    this.emit('breakFinished', {
      startedAt: this.breakStartedAt,
      durationMin: Math.max(1, Math.round(this.totalMs / 60000))
    })
    return this.snapshot()
  }

  /** 用户选择继续休息：按设置时长延长当前休息 */
  extendBreak() {
    if (this.stage !== STAGE.BREAK || !this.awaitingBreakChoice) return this.snapshot()
    const minutes = Math.max(1, Math.min(60, parseInt(this.settings.break_extend_min || 5, 10)))
    const extraMs = minutes * 60 * 1000
    this.awaitingBreakChoice = false
    this.totalMs += extraMs
    this.remainMs = extraMs
    this.running = true
    this._startTicker()
    this.emitState()
    return this.snapshot()
  }

  /** 用户提前结束休息：按实际已休息时长进入记录页 */
  endBreakEarlyForRecording() {
    if (this.stage !== STAGE.BREAK) return this.snapshot()
    this._stopTicker()
    this.running = false
    this.awaitingBreakChoice = false
    const elapsedMs = Math.max(0, this.totalMs - this.remainMs)
    this.stage = STAGE.RECORDING
    this.recordingFor = 'break'
    this.recordingDurationMin = Math.max(1, Math.round(elapsedMs / 60000))
    this.emitState()
    this.emit('breakFinished', {
      startedAt: this.breakStartedAt,
      durationMin: Math.max(1, Math.round(elapsedMs / 60000))
    })
    return this.snapshot()
  }

  /**
   * 休息记录保存（或放弃）后：进入下一工作段
   * 注意：只在休息记录流程里调用（skipBreak 走 skipBreak）
   */
  startNextFocus() {
    this.taskId = null
    this.taskTitle = ''
    this.taskProject = ''
    this._advanceRound()
    this._beginFocus()
  }

  /** 推进轮次：满 N 段回到第 1 段 */
  _advanceRound() {
    this.phaseInRound = this.phaseInRound % this.longBreakEvery() + 1
  }

  _startTicker() {
    this._stopTicker()
    this.endAt = Date.now() + this.remainMs
    // 250ms 一查，取与 endAt 的差值，天然抗漂移
    this.interval = setInterval(() => {
      const remain = this.endAt - Date.now()
      if (remain <= 0) {
        this.remainMs = 0
        this._stopTicker()
        if (this.stage === STAGE.FOCUS) {
          this._onFocusFinished()
        } else {
          this._onBreakFinished()
        }
        return
      }
      this.remainMs = remain
      this.emitState()
    }, 250)
  }

  _stopTicker() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /** 格式化剩余时间 MM:SS（供渲染层直接用） */
  get displayTime() {
    const totalSec = Math.ceil(this.remainMs / 1000)
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0')
    const s = String(totalSec % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  /** 序列化快照，IPC 广播用 */
  snapshot() {
    return {
      stage: this.stage,
      running: this.running,
      phaseInRound: this.phaseInRound,
      totalMs: this.totalMs,
      remainMs: this.remainMs,
      startedAt: this.startedAt,
      recordingFor: this.recordingFor,
      taskId: this.taskId,
      taskTitle: this.taskTitle,
      taskProject: this.taskProject,
      recordingDurationMin: this.recordingDurationMin,
      awaitingFocusChoice: this.awaitingFocusChoice,
      awaitingBreakChoice: this.awaitingBreakChoice,
      delayFocusMin: Math.max(1, Math.min(120, parseInt(this.settings.delay_focus_min || 10, 10))),
      breakExtendMin: Math.max(1, Math.min(60, parseInt(this.settings.break_extend_min || 5, 10))),
      display: this.displayTime,
      isLongBreak: this.stage === STAGE.BREAK && this.phaseInRound % this.longBreakEvery() === 0
    }
  }

  emitState() {
    this.emit('state', this.snapshot())
  }
}

module.exports = new Timer()
module.exports.STAGE = STAGE
