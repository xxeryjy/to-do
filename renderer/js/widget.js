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

    const dotColor = {
      idle: '#7A8290',
      focus: '#14B8A6',
      break: '#34D399',
      recording: '#5EEAD4'
    }[nextState.stage] || '#7A8290'
    $('wDot').style.background = dotColor

    $('wPlay').textContent = nextState.running && nextState.stage !== 'idle' ? 'Ⅱ' : '▶'
    $('wPlay').title = window.I18n.t(nextState.running && nextState.stage !== 'idle' ? 'widget.pause' : 'widget.resume')
  }

  $('wPlay').addEventListener('click', async (event) => {
    event.stopPropagation()
    const current = state || await window.todo.timerState()
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
