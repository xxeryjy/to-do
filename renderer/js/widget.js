/**
 * 桌面 TODO · 挂件逻辑
 * 显示项由设置控制，默认仅保留进度条和状态点。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  let state = null
  let settings = {
    widget_show_play: '0',
    widget_show_time: '0'
  }

  function applyVisibility() {
    $('wPlay').style.display = settings.widget_show_play === '1' ? 'flex' : 'none'
    $('wTime').style.display = settings.widget_show_time === '1' ? 'block' : 'none'
  }

  function render(nextState) {
    state = nextState
    $('wTime').textContent = nextState.display

    if (nextState.totalMs > 0) {
      const pct = Math.max(0, Math.min(100, (1 - nextState.remainMs / nextState.totalMs) * 100))
      $('wFill').style.width = pct.toFixed(1) + '%'
    } else {
      $('wFill').style.width = '0%'
    }

    const theme = document.documentElement.dataset.theme || 'dark'
    const accent = theme === 'candy' ? '#FF6FAE' : theme === 'light' ? '#5F8A70' : '#14B8A6'
    const dotColor = nextState.stage === 'idle' ? '#7A8290' : accent
    $('wDot').style.background = dotColor

    const awaitingChoice = nextState.awaitingFocusChoice || nextState.awaitingBreakChoice
    $('wPlay').textContent = awaitingChoice ? '!' : nextState.running && nextState.stage !== 'idle' ? 'Ⅱ' : '▶'
    $('wPlay').title = awaitingChoice
      ? window.I18n.t('widget.openChoice')
      : window.I18n.t(nextState.running && nextState.stage !== 'idle' ? 'widget.pause' : 'widget.resume')
  }

  $('wPlay').addEventListener('click', async (event) => {
    event.stopPropagation()
    const current = state || await window.todo.timerState()
    if (current.awaitingFocusChoice || current.awaitingBreakChoice) {
      await window.todo.widgetExpand()
      return
    }
    if (current.stage === 'recording') return
    if (current.running && current.stage !== 'idle') {
      await window.todo.timerPause()
    } else {
      await window.todo.timerStart()
    }
  })

  $('widget').addEventListener('dblclick', async () => {
    await window.todo.widgetExpand()
  })

  function applySettings(nextSettings) {
    window.I18n.setLanguage(nextSettings.language || 'en')
    window.I18n.translateDocument()
    document.documentElement.dataset.theme = ['candy', 'light'].includes(nextSettings.ui_style)
      ? nextSettings.ui_style
      : 'dark'
    document.title = window.I18n.t('app.widgetTitle')
    settings = nextSettings
    applyVisibility()
  }

  window.todo.onSettingsChanged(() => {
    window.todo.settingsGet().then((nextSettings) => {
      applySettings(nextSettings)
    })
  })

  window.todo.onTimerState((nextState) => render(nextState))
  window.todo.onFocusFinished(() => {
    if (state) render(state)
  })

  window.todo.timerState().then(render)
  window.todo.settingsGet().then((nextSettings) => {
    applySettings(nextSettings)
  })
})()
