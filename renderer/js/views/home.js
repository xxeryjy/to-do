/**
 * 桌面 TODO · 主屏视图
 * 渲染计时状态、今日指标和专注操作。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const STATUS_TEXT = {
    idle: '空闲',
    focus: '专注中',
    break: '休息中',
    recording: '记录中'
  }

  const STATUS_COLOR = {
    idle: '#7A8290',
    focus: '#14B8A6',
    break: '#34D399',
    recording: '#5EEAD4'
  }

  let lastStartedAt = null

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
    const rest = String(seconds % 60).padStart(2, '0')
    return `${minutes}:${rest}`
  }

  function render(state) {
    if (!state) return

    $('homeTime').textContent = state.display
    $('homeStatusText').textContent = STATUS_TEXT[state.stage] || state.stage
    $('homeStatusDot').style.background = STATUS_COLOR[state.stage] || STATUS_COLOR.idle

    const modeMap = {
      idle: '准备开始',
      focus: state.running ? '保持专注' : '已暂停',
      break: state.isLongBreak ? '长休息中' : '短休息中',
      recording: '等待填写记录'
    }
    $('homeMode').textContent = modeMap[state.stage] || state.stage

    const every = parseInt(window.Store.settings.long_break_every || 4, 10)
    $('homePhase').textContent = `${String(state.phaseInRound).padStart(2, '0')} / ${String(every).padStart(2, '0')}`

    if (state.totalMs > 0) {
      const progress = Math.max(0, Math.min(1, 1 - state.remainMs / state.totalMs))
      $('homeProgressFill').style.width = `${(progress * 100).toFixed(1)}%`
      $('homeElapsed').textContent = formatDuration(state.totalMs - state.remainMs)
      $('homeTarget').textContent = formatDuration(state.totalMs)
    } else {
      $('homeProgressFill').style.width = '0%'
      $('homeElapsed').textContent = '00:00'
      $('homeTarget').textContent = `${window.Store.settings.work_min || 25}:00`
    }

    const recording = state.stage === 'recording'
    const idle = state.stage === 'idle'
    $('btnStop').disabled = recording || idle
    $('btnAddManualHome').disabled = recording

    if (recording) {
      $('btnStart').textContent = '去填写记录'
    } else if (idle) {
      $('btnStart').textContent = '开始专注'
    } else if (state.stage === 'break') {
      $('btnStart').textContent = state.running ? '暂停休息' : '继续休息'
    } else {
      $('btnStart').textContent = state.running ? '暂停计时' : '继续专注'
    }

    $('btnStop').textContent = state.stage === 'break' ? '跳过' : '结束'
    $('btnStop').title = state.stage === 'break' ? '跳过当前休息' : '结束当前专注段'

    const activeMinutes = idle
      ? parseInt(window.Store.settings.work_min || 25, 10)
      : Math.round(state.totalMs / 60000)
    document.querySelectorAll('.preset-option').forEach((button) => {
      const selected = Number(button.dataset.preset) === activeMinutes
      button.classList.toggle('active', selected)
      button.disabled = !idle
      button.title = idle ? `选择 ${button.dataset.preset} 分钟` : '结束当前段后可更改时长'
    })

    if (state.startedAt) lastStartedAt = state.startedAt
  }

  async function refreshStats() {
    const data = await window.todo.recordGetToday()
    $('homeSessions').textContent = data.stats.segs || 0
    $('homeMinutes').textContent = `${data.stats.minutes || 0} 分`
    $('homeStreak').textContent = `${data.stats.streak || 0} 天`
  }

  async function toggleTimer() {
    const state = window.Store.timer
    if (!state) return
    if (state.stage === 'recording') {
      window.App.go('record')
      return
    }
    if (state.running && state.stage !== 'idle') {
      await window.todo.timerPause()
    } else if (state.stage === 'idle') {
      await window.todo.timerStart()
    } else {
      await window.todo.timerResume()
    }
    refreshStats()
  }

  function bind() {
    $('btnStart').addEventListener('click', toggleTimer)
    $('shortcutHome').addEventListener('click', toggleTimer)

    $('btnStop').addEventListener('click', async () => {
      const state = window.Store.timer
      if (!state || state.stage === 'idle' || state.stage === 'recording') return

      const isBreak = state.stage === 'break'
      const elapsed = formatDuration(state.totalMs - state.remainMs)
      const confirmed = await window.App.confirm({
        title: isBreak ? '跳过当前休息？' : '结束当前专注？',
        message: isBreak
          ? `当前休息还剩 ${state.display}，跳过将立即开始下一段专注。`
          : `当前段已进行 ${elapsed}，结束后不会写入记录。`,
        confirmText: isBreak ? '跳过休息' : '结束本段',
        cancelText: isBreak ? '继续休息' : '继续专注'
      })
      if (!confirmed) return

      if (isBreak) {
        await window.todo.timerSkipBreak()
      } else {
        await window.todo.timerStop()
      }
      refreshStats()
    })

    document.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.Store.timer || window.Store.timer.stage !== 'idle') return
        const minutes = parseInt(button.dataset.preset, 10)
        await window.todo.timerSetDuration(minutes)
        window.Store.settings = await window.todo.settingsGet()
        render(window.Store.timer)
      })
    })

    $('btnAddManualHome').addEventListener('click', () => {
      window.recordManual = {
        active: true,
        type: 'focus',
        back: 'home',
        enterAt: Date.now()
      }
      window.App.go('record')
    })
  }

  window.todo.onFocusFinished(({ startedAt, durationMin }) => {
    window.lastFocusStartedAt = startedAt || lastStartedAt
    window.lastFocusDurationMin = durationMin
    window.App.go('record')
  })

  window.todo.onBreakFinished(({ startedAt, durationMin }) => {
    window.lastBreakStartedAt = startedAt
    window.lastBreakDurationMin = durationMin
    window.App.go('record')
  })

  window.Store.onChange(render)
  window.App.onView('home', refreshStats)
  window.HomeView = { render, refreshStats, toggleTimer }
  bind()
})()
