/**
 * 桌面 TODO · 主屏视图
 * 渲染计时状态、今日指标和专注操作。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

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
    const awaitingChoice = !!state.awaitingFocusChoice
    $('homeStatusText').textContent = window.I18n.t(awaitingChoice ? 'home.status.awaitingChoice' : `home.status.${state.stage}`)
    $('homeStatusDot').style.background = STATUS_COLOR[state.stage] || STATUS_COLOR.idle

    const modeKey = awaitingChoice
      ? 'home.mode.awaitingChoice'
      : state.stage === 'focus'
      ? (state.running ? 'home.mode.focus' : 'home.mode.focusPaused')
      : (state.stage === 'break'
        ? (state.isLongBreak ? 'home.mode.breakLong' : 'home.mode.breakShort')
        : `home.mode.${state.stage}`)
    $('homeMode').textContent = window.I18n.t(modeKey)

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
    $('btnStop').disabled = recording || idle || awaitingChoice
    $('btnAddManualHome').disabled = recording
    $('btnStart').disabled = awaitingChoice

    if (awaitingChoice) {
      $('btnStart').textContent = window.I18n.t('home.action.choose')
    } else if (recording) {
      $('btnStart').textContent = window.I18n.t('home.action.record')
    } else if (idle) {
      $('btnStart').textContent = window.I18n.t('home.action.start')
    } else if (state.stage === 'break') {
      $('btnStart').textContent = window.I18n.t(state.running ? 'home.action.pauseBreak' : 'home.action.resumeBreak')
    } else {
      $('btnStart').textContent = window.I18n.t(state.running ? 'home.action.pause' : 'home.action.resume')
    }

    $('btnStop').textContent = window.I18n.t('home.action.end')
    $('btnStop').title = window.I18n.t(state.stage === 'break' ? 'home.tooltip.endBreak' : 'home.tooltip.endPhase')

    const activeMinutes = idle
      ? parseInt(window.Store.settings.work_min || 25, 10)
      : Math.round(state.totalMs / 60000)
    document.querySelectorAll('.preset-option').forEach((button) => {
      const selected = Number(button.dataset.preset) === activeMinutes
      button.classList.toggle('active', selected)
      button.textContent = window.I18n.t('home.preset', { count: button.dataset.preset })
      button.disabled = !idle
      button.title = idle
        ? window.I18n.t('home.preset', { count: button.dataset.preset })
        : window.I18n.t('home.preset.locked')
    })

    if (state.startedAt) lastStartedAt = state.startedAt
  }

  async function refreshStats() {
    const data = await window.todo.recordGetToday()
    $('homeSessions').textContent = data.stats.segs || 0
    $('homeMinutes').textContent = window.I18n.t('home.preset', { count: data.stats.minutes || 0 })
    $('homeStreak').textContent = window.I18n.days(data.stats.streak || 0)
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
      const wasRunning = state.running
      const elapsed = formatDuration(state.totalMs - state.remainMs)
      if (wasRunning) await window.todo.timerPause()
      const confirmed = await window.App.confirm({
        title: window.I18n.t(isBreak ? 'home.confirm.endBreak.title' : 'home.confirm.end.title'),
        message: window.I18n.t(isBreak ? 'home.confirm.endBreak.message' : 'home.confirm.end.message', { elapsed }),
        confirmText: window.I18n.t(isBreak ? 'home.confirm.endBreak.confirm' : 'home.confirm.end.confirm'),
        cancelText: window.I18n.t(isBreak ? 'home.confirm.endBreak.cancel' : 'home.confirm.end.cancel')
      })
      if (!confirmed) {
        if (wasRunning) await window.todo.timerResume()
        return
      }

      if (isBreak) {
        await window.todo.timerEndBreakEarly()
      } else {
        await window.todo.timerEndFocusEarly()
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
  window.App.onView('home', () => {
    render(window.Store.timer)
    refreshStats()
  })
  window.HomeView = { render, refreshStats, toggleTimer }
  bind()
})()
