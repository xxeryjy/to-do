/**
 * 桌面 TODO · 设置视图
 * 邮件、计时节奏、挂件显示和每日自动发送。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const STEPPERS = [
    { key: 'work_min', label: '专注时长', min: 1, max: 120, unit: '分钟', tileClass: 'primary-tile' },
    { key: 'short_break_min', label: '短休息', min: 1, max: 30, unit: '分钟', tileClass: '' },
    { key: 'long_break_min', label: '长休息', min: 1, max: 60, unit: '分钟', tileClass: 'success-tile' },
    { key: 'long_break_every', label: '长休频率', min: 1, max: 8, unit: '段', tileClass: 'warning-tile' }
  ]

  function autoHint() {
    const enabled = $('setAutoMail').checked
    const time = $('setAutoMailTime').value || '18:00'
    if (!enabled) return '自动发送已关闭'
    const base = `每天 ${time} 自动发送；无记录时跳过，错过后下次启动补发`
    const lastError = window.Store.settings.daily_mail_last_error
    return lastError ? `${base} · 上次发送失败` : base
  }

  function refreshAutoHint() {
    $('autoMailHint').textContent = autoHint()
  }

  function render() {
    const settings = window.Store.settings
    const email = settings.qq_email || ''

    $('setEmail').value = email
    $('setAuth').value = ''
    $('emailSummary').textContent = email ? `${email} · SMTP 已配置` : '尚未配置邮箱'

    $('setWidgetPlay').checked = settings.widget_show_play === '1'
    $('setWidgetTime').checked = settings.widget_show_time === '1'
    $('setAutoMail').checked = settings.daily_mail_enabled === '1'
    $('setAutoMailTime').value = settings.daily_mail_time || '18:00'
    refreshAutoHint()

    const grid = $('steppers')
    grid.innerHTML = ''
    for (const stepper of STEPPERS) {
      const tile = document.createElement('div')
      tile.className = `timer-tile ${stepper.tileClass}`.trim()
      const value = settings[stepper.key] || String(stepper.min)
      tile.innerHTML = `
        <span>${stepper.label}</span>
        <div class="timer-control-row">
          <b data-val="${stepper.key}">${value} ${stepper.unit}</b>
          <div class="stepper-actions">
            <button type="button" data-minus="${stepper.key}" aria-label="${stepper.label}减少" title="范围 ${stepper.min}–${stepper.max} ${stepper.unit}">−</button>
            <button type="button" data-plus="${stepper.key}" aria-label="${stepper.label}增加" title="范围 ${stepper.min}–${stepper.max} ${stepper.unit}">＋</button>
          </div>
        </div>
      `
      grid.appendChild(tile)
    }

    grid.querySelectorAll('[data-minus]').forEach((button) => {
      button.addEventListener('click', () => step(button.dataset.minus, -1))
    })
    grid.querySelectorAll('[data-plus]').forEach((button) => {
      button.addEventListener('click', () => step(button.dataset.plus, 1))
    })
  }

  function step(key, delta) {
    const stepper = STEPPERS.find((item) => item.key === key)
    const current = parseInt(window.Store.settings[key] || stepper.min, 10)
    const next = Math.max(stepper.min, Math.min(stepper.max, current + delta))
    window.Store.settings[key] = String(next)
    document.querySelector(`[data-val="${key}"]`).textContent = `${next} ${stepper.unit}`
  }

  function toggleEmailEditor() {
    const editor = $('emailEditor')
    const open = editor.classList.toggle('open')
    $('btnEditEmail').textContent = open ? '收起' : '编辑'
    if (open) $('setEmail').focus()
  }

  async function saveSettings() {
    const email = $('setEmail').value.trim()
    const auth = $('setAuth').value.trim()
    const autoEnabled = $('setAutoMail').checked
    const autoTime = $('setAutoMailTime').value

    if (autoEnabled && !autoTime) {
      window.App.toast('请选择自动发送时间')
      $('setAutoMailTime').focus()
      return
    }

    const updates = {
      qq_email: email,
      widget_show_play: $('setWidgetPlay').checked ? '1' : '0',
      widget_show_time: $('setWidgetTime').checked ? '1' : '0',
      daily_mail_time: autoTime || '18:00',
      daily_mail_enabled: autoEnabled ? '1' : '0'
    }
    if (auth) updates.qq_auth_code = auth
    for (const stepper of STEPPERS) {
      updates[stepper.key] = window.Store.settings[stepper.key] || String(stepper.min)
    }

    const button = $('btnSaveSettings')
    button.disabled = true
    button.textContent = '保存中…'

    try {
      await window.todo.settingsSetMany(updates)
      window.Store.settings = await window.todo.settingsGet()
      $('setAuth').value = ''
      render()
      window.App.toast('设置已保存')
    } catch (error) {
      window.App.toast(`保存失败：${error.message || '请稍后重试'}`)
    } finally {
      button.disabled = false
      button.textContent = '保存设置'
    }
  }

  function bind() {
    $('btnEditEmail').addEventListener('click', toggleEmailEditor)
    $('setAutoMail').addEventListener('change', refreshAutoHint)
    $('setAutoMailTime').addEventListener('input', refreshAutoHint)
    $('btnSaveSettings').addEventListener('click', saveSettings)
    window.App.onView('settings', render)
  }

  window.SettingsView = { render, saveSettings }
  bind()
})()
