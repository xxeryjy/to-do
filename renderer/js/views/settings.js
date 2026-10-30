/**
 * 桌面 TODO · 设置视图
 * 邮件、计时节奏、挂件、系统行为和每日自动发送。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const STEPPERS = [
    { key: 'work_min', labelKey: 'settings.stepper.work', min: 1, max: 120, unitKey: 'settings.unit.minutes', tileClass: 'primary-tile' },
    { key: 'short_break_min', labelKey: 'settings.stepper.shortBreak', min: 1, max: 30, unitKey: 'settings.unit.minutes', tileClass: '' },
    { key: 'long_break_min', labelKey: 'settings.stepper.longBreak', min: 1, max: 60, unitKey: 'settings.unit.minutes', tileClass: 'success-tile' },
    { key: 'long_break_every', labelKey: 'settings.stepper.longBreakEvery', min: 1, max: 8, unitKey: 'settings.unit.rounds', tileClass: 'warning-tile' },
    { key: 'delay_focus_min', labelKey: 'settings.stepper.delay', min: 1, max: 120, unitKey: 'settings.unit.minutes', tileClass: '', wide: true },
    { key: 'break_extend_min', labelKey: 'settings.stepper.breakExtend', min: 1, max: 60, unitKey: 'settings.unit.minutes', tileClass: '', wide: true }
  ]

  function labelOf(stepper) {
    return window.I18n.t(stepper.labelKey)
  }

  function unitOf(stepper) {
    return window.I18n.t(stepper.unitKey)
  }

  function autoHint() {
    const enabled = $('setAutoMail').checked
    const time = $('setAutoMailTime').value || '18:00'
    if (!enabled) return window.I18n.t('settings.mail.off')
    const base = window.I18n.t('settings.mail.on', { time })
    const lastError = window.Store.settings.daily_mail_last_error
    return lastError ? `${base} · ${window.I18n.t('settings.mail.failed')}` : base
  }

  function refreshAutoHint() {
    $('autoMailHint').textContent = autoHint()
  }

  function renderThemeSelection() {
    const selected = window.Store.settings.ui_style || 'dark'
    document.querySelectorAll('#themeSelector [data-ui-style]').forEach((button) => {
      button.classList.toggle('active', button.dataset.uiStyle === selected)
      button.setAttribute('aria-pressed', button.dataset.uiStyle === selected ? 'true' : 'false')
    })
  }

  async function renderIntegrations() {
    const box = $('integrationList')
    if (!box || !window.todo.integrationsList) return
    const providers = await window.todo.integrationsList()
    box.innerHTML = ''
    for (const provider of providers) {
      const row = document.createElement('div')
      row.className = 'integration-row'
      const copy = document.createElement('div')
      copy.className = 'integration-copy'
      const name = document.createElement('b')
      name.textContent = provider.name
      const hint = document.createElement('span')
      hint.textContent = window.I18n.t('settings.integrations.oauthRequired')
      copy.append(name, hint)
      const status = document.createElement('span')
      status.className = 'integration-status'
      status.textContent = window.I18n.t('settings.integrations.notConfigured')
      row.append(copy, status)
      box.appendChild(row)
    }
  }

  function render() {
    const settings = window.Store.settings
    const email = settings.qq_email || ''

    $('setEmail').value = email
    $('setAuth').value = ''
    $('emailSummary').textContent = email
      ? window.I18n.t('settings.email.configured', { email })
      : window.I18n.t('settings.email.missing')
    $('btnEditEmail').textContent = window.I18n.t(
      $('emailEditor').classList.contains('open') ? 'settings.email.collapse' : 'settings.email.edit'
    )

    document.querySelectorAll('#languageSwitch [data-language]').forEach((button) => {
      button.classList.toggle('active', button.dataset.language === (settings.language || 'en'))
    })
    renderThemeSelection()
    renderIntegrations().catch(() => {})

    $('setWidgetPlay').checked = settings.widget_show_play === '1'
    $('setWidgetTime').checked = settings.widget_show_time === '1'
    $('setLaunchAtLogin').checked = settings.launch_at_login === '1'
    $('setNotifications').checked = settings.notifications_enabled === '1'
    $('setNotificationSound').checked = settings.notification_sound_enabled === '1'
    $('setAutomationDraft').checked = settings.automation_draft_enabled === '1'
    $('setAutomationMapping').checked = settings.automation_task_mapping_enabled === '1'
    $('setFocusScene').checked = settings.focus_scene_enabled === '1'
    $('setFocusDnd').checked = settings.focus_scene_dnd_enabled === '1'
    $('setLaunchApps').checked = settings.focus_launch_apps_enabled === '1'
    $('setShortcutsEnabled').checked = settings.shortcuts_enabled === '1'
    let appPaths = []
    try { appPaths = JSON.parse(settings.focus_launch_apps || '[]') } catch (_error) {}
    $('focusLaunchApps').value = Array.isArray(appPaths) ? appPaths.join('\n') : ''
    $('setWeeklyMail').checked = settings.weekly_mail_enabled === '1'
    $('setWeeklyMailDay').value = settings.weekly_mail_day || '5'
    $('setWeeklyMailTime').value = settings.weekly_mail_time || '18:30'
    $('setAutoMail').checked = settings.daily_mail_enabled === '1'
    $('setAutoMailTime').value = settings.daily_mail_time || '18:00'
    refreshAutoHint()

    const grid = $('steppers')
    grid.innerHTML = ''
    for (const stepper of STEPPERS) {
      const tile = document.createElement('div')
      tile.className = `timer-tile ${stepper.tileClass} ${stepper.wide ? 'wide-tile' : ''}`.trim()
      const value = settings[stepper.key] || String(stepper.min)
      const label = labelOf(stepper)
      const unit = unitOf(stepper)
      tile.innerHTML = `
        <span>${label}</span>
        <div class="timer-control-row">
          <b data-val="${stepper.key}">${value} ${unit}</b>
          <div class="stepper-actions">
            <button type="button" data-minus="${stepper.key}" aria-label="${window.I18n.t('settings.stepper.decrease', { label })}" title="${window.I18n.t('settings.stepper.range', { min: stepper.min, max: stepper.max, unit })}">−</button>
            <button type="button" data-plus="${stepper.key}" aria-label="${window.I18n.t('settings.stepper.increase', { label })}" title="${window.I18n.t('settings.stepper.range', { min: stepper.min, max: stepper.max, unit })}">＋</button>
          </div>
        </div>
      `
      grid.appendChild(tile)
    }

    $('btnSaveSettings').textContent = window.I18n.t('settings.save')
    if (window.App && window.App.renderUpdateStatus) window.App.renderUpdateStatus()

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
    document.querySelector(`[data-val="${key}"]`).textContent = `${next} ${unitOf(stepper)}`
  }

  function toggleEmailEditor() {
    const editor = $('emailEditor')
    const open = editor.classList.toggle('open')
    $('btnEditEmail').textContent = window.I18n.t(open ? 'settings.email.collapse' : 'settings.email.edit')
    if (open) $('setEmail').focus()
  }

  function captureForm() {
    return {
      email: $('setEmail').value,
      auth: $('setAuth').value,
      emailOpen: $('emailEditor').classList.contains('open'),
      widgetPlay: $('setWidgetPlay').checked,
      widgetTime: $('setWidgetTime').checked,
      launchAtLogin: $('setLaunchAtLogin').checked,
      notifications: $('setNotifications').checked,
      notificationSound: $('setNotificationSound').checked,
      automationDraft: $('setAutomationDraft').checked,
      automationMapping: $('setAutomationMapping').checked,
      focusScene: $('setFocusScene').checked,
      focusDnd: $('setFocusDnd').checked,
      launchApps: $('setLaunchApps').checked,
      shortcutsEnabled: $('setShortcutsEnabled').checked,
      focusLaunchApps: $('focusLaunchApps').value,
      weeklyMail: $('setWeeklyMail').checked,
      weeklyMailDay: $('setWeeklyMailDay').value,
      weeklyMailTime: $('setWeeklyMailTime').value,
      autoMail: $('setAutoMail').checked,
      autoMailTime: $('setAutoMailTime').value,
      uiStyle: window.Store.settings.ui_style || 'dark'
    }
  }

  function restoreForm(draft) {
    $('setEmail').value = draft.email
    $('setAuth').value = draft.auth
    $('setWidgetPlay').checked = draft.widgetPlay
    $('setWidgetTime').checked = draft.widgetTime
    $('setLaunchAtLogin').checked = draft.launchAtLogin
    $('setNotifications').checked = draft.notifications
    $('setNotificationSound').checked = draft.notificationSound
    $('setAutomationDraft').checked = draft.automationDraft
    $('setAutomationMapping').checked = draft.automationMapping
    $('setFocusScene').checked = draft.focusScene
    $('setFocusDnd').checked = draft.focusDnd
    $('setLaunchApps').checked = draft.launchApps
    $('setShortcutsEnabled').checked = draft.shortcutsEnabled
    $('focusLaunchApps').value = draft.focusLaunchApps
    $('setWeeklyMail').checked = draft.weeklyMail
    $('setWeeklyMailDay').value = draft.weeklyMailDay
    $('setWeeklyMailTime').value = draft.weeklyMailTime
    $('setAutoMail').checked = draft.autoMail
    $('setAutoMailTime').value = draft.autoMailTime
    window.Store.settings.ui_style = draft.uiStyle
    window.App.applyTheme(draft.uiStyle)
    renderThemeSelection()
    $('emailEditor').classList.toggle('open', draft.emailOpen)
    $('btnEditEmail').textContent = window.I18n.t(draft.emailOpen ? 'settings.email.collapse' : 'settings.email.edit')
    refreshAutoHint()
  }

  async function changeLanguage(language) {
    if (!language || language === (window.Store.settings.language || 'en')) return
    const draft = captureForm()
    await window.todo.settingsSet('language', language)
    window.Store.settings.language = language
    window.App.refreshLanguage()
    render()
    restoreForm(draft)
  }

  async function saveSettings() {
    const email = $('setEmail').value.trim()
    const auth = $('setAuth').value.trim()
    const autoEnabled = $('setAutoMail').checked
    const autoTime = $('setAutoMailTime').value

    if (autoEnabled && !autoTime) {
      window.App.toast(window.I18n.t('settings.timeRequired'))
      $('setAutoMailTime').focus()
      return
    }

    const updates = {
      qq_email: email,
      widget_show_play: $('setWidgetPlay').checked ? '1' : '0',
      widget_show_time: $('setWidgetTime').checked ? '1' : '0',
      launch_at_login: $('setLaunchAtLogin').checked ? '1' : '0',
      notifications_enabled: $('setNotifications').checked ? '1' : '0',
      notification_sound_enabled: $('setNotificationSound').checked ? '1' : '0',
      automation_draft_enabled: $('setAutomationDraft').checked ? '1' : '0',
      automation_task_mapping_enabled: $('setAutomationMapping').checked ? '1' : '0',
      focus_scene_enabled: $('setFocusScene').checked ? '1' : '0',
      focus_scene_dnd_enabled: $('setFocusDnd').checked ? '1' : '0',
      focus_launch_apps_enabled: $('setLaunchApps').checked ? '1' : '0',
      focus_launch_apps: JSON.stringify($('focusLaunchApps').value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)),
      shortcuts_enabled: $('setShortcutsEnabled').checked ? '1' : '0',
      weekly_mail_enabled: $('setWeeklyMail').checked ? '1' : '0',
      weekly_mail_day: $('setWeeklyMailDay').value || '5',
      weekly_mail_time: $('setWeeklyMailTime').value || '18:30',
      daily_mail_time: autoTime || '18:00',
      daily_mail_enabled: autoEnabled ? '1' : '0',
      language: window.Store.settings.language || 'en',
      ui_style: window.Store.settings.ui_style || 'dark'
    }
    if (auth) updates.qq_auth_code = auth
    for (const stepper of STEPPERS) {
      updates[stepper.key] = window.Store.settings[stepper.key] || String(stepper.min)
    }

    const button = $('btnSaveSettings')
    button.disabled = true
    button.textContent = window.I18n.t('settings.saving')

    try {
      await window.todo.settingsSetMany(updates)
      window.Store.settings = await window.todo.settingsGet()
      $('setAuth').value = ''
      render()
      window.App.toast(window.I18n.t('settings.saved'))
    } catch (error) {
      window.App.toast(window.I18n.t('settings.saveFailed', {
        error: error.message || window.I18n.t('settings.retry')
      }))
    } finally {
      button.disabled = false
      button.textContent = window.I18n.t('settings.save')
    }
  }

  function bind() {
    $('btnEditEmail').addEventListener('click', toggleEmailEditor)
    $('setAutoMail').addEventListener('change', refreshAutoHint)
    $('setAutoMailTime').addEventListener('input', refreshAutoHint)
    $('btnSaveSettings').addEventListener('click', saveSettings)
    document.querySelectorAll('#themeSelector [data-ui-style]').forEach((button) => {
      button.addEventListener('click', () => {
        const style = button.dataset.uiStyle
        if (!style || style === window.Store.settings.ui_style) return
        window.Store.settings.ui_style = style
        window.App.applyTheme(style)
        renderThemeSelection()
      })
    })
    document.querySelectorAll('#languageSwitch [data-language]').forEach((button) => {
      button.addEventListener('click', () => {
        changeLanguage(button.dataset.language).catch((error) => {
          window.App.toast(window.I18n.t('settings.saveFailed', {
            error: error.message || window.I18n.t('settings.retry')
          }))
        })
      })
    })
    window.App.onView('settings', render)
  }

  window.SettingsView = { render, saveSettings }
  bind()
})()
