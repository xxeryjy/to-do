/**
 * 桌面 TODO · 渲染层 SPA 控制器
 * 页面切换、主导航、Toast、全局快捷键和启动初始化。
 */
;(function () {
  const VIEWS = ['home', 'record', 'today', 'settings', 'history']
  const NAV = [
    { view: 'home', key: 'nav.home' },
    { view: 'today', key: 'nav.today' },
    { view: 'history', key: 'nav.history' },
    { view: 'settings', key: 'nav.settings' }
  ]

  const App = {
    current: 'home',
    _viewHooks: {},
    _updateInfo: null,
    _updateChecking: false,
    _dismissedUpdateVersion: '',

    async init() {
      await window.Store.init()
      window.I18n.setLanguage(window.Store.settings.language || 'en')
      window.I18n.translateDocument()

      window.Store.onChange((timer) => {
        if (timer && timer.stage === 'recording' && this.current !== 'record') {
          this.go('record')
        }
      })

      const nav = document.getElementById('navDots')
      nav.innerHTML = ''
      for (const item of NAV) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'nav-item'
        button.dataset.go = item.view
        button.dataset.i18nNav = item.key
        button.textContent = window.I18n.t(item.key)
        button.addEventListener('click', () => this.go(item.view))
        nav.appendChild(button)
      }

      document.querySelectorAll('[data-go]').forEach((element) => {
        if (element.closest('#navDots')) return
        element.addEventListener('click', () => this.go(element.dataset.go))
      })

      document.querySelectorAll('.win-min').forEach((element) => {
        element.addEventListener('click', () => window.todo.windowMinimize())
      })
      document.querySelectorAll('.win-close').forEach((element) => {
        element.addEventListener('click', () => window.todo.windowCloseToTray())
      })

      this.bindWindowDrag()
      this.bindConfirmDialog()
      this.bindFatigueDialog()
      this.bindGlobalShortcuts()
      this.bindAutoMailStatus()
      this.bindUpdater()

      window.HomeView && window.HomeView.render(window.Store.timer)
      window.HomeView && window.HomeView.refreshStats && window.HomeView.refreshStats()
      this.syncNav()
      this.maybeShowFatiguePrompt(window.Store.timer)
      if (window.Store.timer && window.Store.timer.stage === 'recording') {
        this.go('record')
      }
    },

    bindWindowDrag() {
      document.querySelectorAll('.drag-region').forEach((header) => {
        header.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return
          if (event.target.closest('button, input, textarea, select, label, a, .no-drag')) return

          let lastX = event.screenX
          let lastY = event.screenY
          const onMove = (moveEvent) => {
            const dx = moveEvent.screenX - lastX
            const dy = moveEvent.screenY - lastY
            if (!dx && !dy) return
            lastX = moveEvent.screenX
            lastY = moveEvent.screenY
            window.todo.windowMoveBy(dx, dy)
          }
          const stop = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', stop)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', stop)
          window.addEventListener('pointercancel', stop)
          event.preventDefault()
        })
      })
    },

    bindConfirmDialog() {
      const dialog = document.getElementById('confirmDialog')
      document.getElementById('confirmCancel').addEventListener('click', () => this.closeConfirm(false))
      document.getElementById('confirmOk').addEventListener('click', () => this.closeConfirm(true))
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) this.closeConfirm(false)
      })
    },

    bindFatigueDialog() {
      document.getElementById('btnFatigueRest').addEventListener('click', async () => {
        this.hideFatiguePrompt()
        const state = await window.todo.timerFinishFocus()
        if (state) window.Store.applyTimerState(state)
      })

      document.getElementById('btnFatigueContinue').addEventListener('click', async () => {
        const minutes = Math.max(1, Math.min(120, parseInt(window.Store.settings.delay_focus_min || '10', 10)))
        this.hideFatiguePrompt()
        const state = await window.todo.timerExtendFocus()
        if (state) window.Store.applyTimerState(state)
        this.toast(window.I18n.t('fatigue.extended', { minutes }))
      })

      if (window.todo.onFocusAwaitingChoice) {
        window.todo.onFocusAwaitingChoice((payload) => this.showFatiguePrompt(payload))
      }
      if (window.todo.onTimerNotificationSound) {
        window.todo.onTimerNotificationSound(() => this.playNotificationSound())
      }
    },

    playNotificationSound() {
      if (!this._notificationAudio) {
        this._notificationAudio = new Audio('../assets/notification.wav')
        this._notificationAudio.volume = 0.55
      }
      this._notificationAudio.currentTime = 0
      this._notificationAudio.play().catch(() => {})
    },

    showFatiguePrompt(payload = {}) {
      const state = window.Store.timer || {}
      const minutes = Math.max(
        1,
        parseInt(payload.durationMin || Math.round((state.totalMs || 0) / 60000) || '25', 10)
      )
      const extension = Math.max(1, Math.min(120, parseInt(window.Store.settings.delay_focus_min || state.delayFocusMin || '10', 10)))
      document.getElementById('fatigueEyebrow').textContent = window.I18n.t('fatigue.eyebrow', { minutes })
      document.getElementById('fatigueHint').textContent = window.I18n.t('fatigue.hint', { minutes: extension })
      document.getElementById('fatiguePanel').hidden = false
      document.querySelector('.timer-card').classList.add('awaiting-choice')
      document.getElementById('btnFatigueRest').focus()
    },

    hideFatiguePrompt() {
      document.getElementById('fatiguePanel').hidden = true
      document.querySelector('.timer-card').classList.remove('awaiting-choice')
    },

    maybeShowFatiguePrompt(state) {
      if (state && state.awaitingFocusChoice) this.showFatiguePrompt(state)
    },

    refreshLanguage() {
      window.I18n.setLanguage(window.Store.settings.language || 'en')
      window.I18n.translateDocument()
      document.querySelectorAll('[data-i18n-nav]').forEach((button) => {
        button.textContent = window.I18n.t(button.dataset.i18nNav)
      })
    },

    confirm({
      title = window.I18n.t('common.confirmTitle'),
      message = window.I18n.t('common.confirmMessage'),
      confirmText = window.I18n.t('common.confirm'),
      cancelText = window.I18n.t('common.cancel')
    } = {}) {
      const dialog = document.getElementById('confirmDialog')
      document.getElementById('confirmTitle').textContent = title
      document.getElementById('confirmMessage').textContent = message
      document.getElementById('confirmOk').textContent = confirmText
      document.getElementById('confirmCancel').textContent = cancelText
      dialog.classList.add('show')
      document.getElementById('confirmCancel').focus()
      return new Promise((resolve) => {
        this._confirmResolve = resolve
      })
    },

    closeConfirm(result) {
      const dialog = document.getElementById('confirmDialog')
      if (!dialog.classList.contains('show')) return
      dialog.classList.remove('show')
      if (this._confirmResolve) {
        const resolve = this._confirmResolve
        this._confirmResolve = null
        resolve(!!result)
      }
    },

    bindGlobalShortcuts() {
      document.addEventListener('keydown', (event) => {
        const target = event.target
        const editing = target && ['INPUT', 'TEXTAREA'].includes(target.tagName)
        const awaitingChoice = !document.getElementById('fatiguePanel').hidden
        const updating = document.getElementById('updateDialog').classList.contains('show')

        if (awaitingChoice || updating) return

        if (event.key === 'Escape' && document.getElementById('confirmDialog').classList.contains('show')) {
          event.preventDefault()
          this.closeConfirm(false)
          return
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          if (this.current === 'home' && window.HomeView && window.HomeView.toggleTimer) {
            window.HomeView.toggleTimer()
          }
          return
        }

        if (!editing && event.key === '/') {
          const search = document.getElementById('histSearch')
          if (search) {
            event.preventDefault()
            if (this.current !== 'history') this.go('history')
            setTimeout(() => search.focus(), 0)
          }
        }
      })
    },

    bindAutoMailStatus() {
      if (!window.todo.onAutoMailStatus) return
      window.todo.onAutoMailStatus(async (payload) => {
        if (!payload) return
        window.Store.settings = await window.todo.settingsGet()
        if (this.current === 'settings' && window.SettingsView) {
          window.SettingsView.render()
        }
        if (payload.type === 'success') {
          const date = window.I18n.formatDate(new Date(`${payload.date}T12:00:00`), {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })
          this.toast(window.I18n.t('toast.autoMailSuccess', { date }))
        } else if (payload.type === 'error') {
          this.toast(window.I18n.t('toast.autoMailError', {
            error: payload.error || window.I18n.t('toast.autoMailConfigError')
          }))
        }
      })
    },

    bindUpdater() {
      const checkButton = document.getElementById('btnCheckUpdates')
      if (!checkButton || !window.todo.updateCheck) return

      checkButton.addEventListener('click', () => {
        if (this._updateInfo && this._updateInfo.updateAvailable) {
          this.showUpdateDialog(this._updateInfo)
        } else {
          this.checkForUpdates(true)
        }
      })
      document.getElementById('btnUpdateLater').addEventListener('click', () => this.hideUpdateDialog())
      document.getElementById('btnUpdateNow').addEventListener('click', () => this.downloadUpdate())
      document.getElementById('btnUpdateManual').addEventListener('click', () => window.todo.openReleasePage())
      if (window.todo.onUpdateStatus) {
        window.todo.onUpdateStatus((state) => this.handleUpdateStatus(state))
      }
      setTimeout(() => this.checkForUpdates(false), 1500)
    },

    async checkForUpdates(manual = false) {
      if (this._updateChecking) return
      this._updateChecking = true
      this.renderUpdateStatus({ status: 'checking', manual })
      try {
        const result = await window.todo.updateCheck({ manual })
        this._updateInfo = result
        this.renderUpdateStatus(result)
        if (result && result.status === 'available') {
          const canPrompt = manual || (window.Store.timer && window.Store.timer.stage === 'idle')
          if (canPrompt && (manual || this._dismissedUpdateVersion !== result.latestVersion)) {
            this.showUpdateDialog(result)
          } else if (!manual) {
            this.toast(window.I18n.t('settings.update.available', { version: result.latestVersion }))
          }
        } else if (manual) {
          if (result.status === 'up-to-date') this.toast(window.I18n.t('settings.update.latest'))
          if (result.status === 'no-release') this.toast(window.I18n.t('settings.update.noRelease'))
          if (result.status === 'error') this.toast(window.I18n.t('settings.update.failed'))
        }
      } catch (error) {
        const failed = {
          status: 'error',
          currentVersion: this._updateInfo?.currentVersion || '',
          errorCode: 'CHECK_FAILED',
          error: error.message || String(error)
        }
        this._updateInfo = failed
        this.renderUpdateStatus(failed)
        if (manual) this.toast(window.I18n.t('settings.update.failed'))
      } finally {
        this._updateChecking = false
        this.renderUpdateStatus(this._updateInfo)
      }
    },

    handleUpdateStatus(state) {
      if (!state) return
      this._updateInfo = { ...(this._updateInfo || {}), ...state }
      this.renderUpdateStatus(this._updateInfo)
      const dialog = document.getElementById('updateDialog')
      if (state.status === 'available' && dialog.classList.contains('show')) {
        this.showUpdateDialog(this._updateInfo)
      }
      if (state.status === 'downloading') {
        document.getElementById('updateProgressWrap').hidden = false
        document.getElementById('updateProgressFill').style.width = `${state.progress || 0}%`
        document.getElementById('updateProgressLabel').textContent = state.fallback
          ? window.I18n.t('update.patchFallback')
          : this.formatDownloadStatus(state)
      } else if (state.status === 'installing') {
        document.getElementById('updateProgressWrap').hidden = false
        document.getElementById('updateProgressFill').style.width = '100%'
        document.getElementById('updateProgressLabel').textContent = window.I18n.t('update.installing')
        document.getElementById('btnUpdateLater').disabled = true
        document.getElementById('btnUpdateNow').disabled = true
      } else if (state.status === 'error' && dialog.classList.contains('show')) {
        const error = this.updateErrorMessage(state.errorCode, state.error)
        document.getElementById('updateMessage').textContent = window.I18n.t('update.failed', { error })
        document.getElementById('updateProgressLabel').textContent = ''
        document.getElementById('btnUpdateLater').disabled = false
        document.getElementById('btnUpdateNow').disabled = false
      }
    },

    renderUpdateStatus(state = this._updateInfo) {
      const currentVersion = (state && state.currentVersion) || this._updateInfo?.currentVersion || ''
      const versionPill = document.getElementById('versionPill')
      if (versionPill && currentVersion) versionPill.textContent = `v${currentVersion}`
      const statusElement = document.getElementById('updateStatus')
      const checkButton = document.getElementById('btnCheckUpdates')
      if (!statusElement || !checkButton) return

      const status = state?.status || 'idle'
      let text = currentVersion
        ? window.I18n.t('settings.update.current', { version: currentVersion })
        : 'Desktop TODO'
      if (status === 'checking') text = window.I18n.t('settings.update.checking')
      if (status === 'available') text = window.I18n.t('settings.update.available', { version: state.latestVersion })
      if (status === 'up-to-date') text = window.I18n.t('settings.update.latest')
      if (status === 'no-release') text = window.I18n.t('settings.update.noRelease')
      if (status === 'error') text = state?.updateAvailable
        ? window.I18n.t('update.failed', { error: this.updateErrorMessage(state.errorCode, state.error) })
        : window.I18n.t('settings.update.failed')
      if (status === 'downloading') text = this.formatDownloadStatus(state)
      if (status === 'installing') text = window.I18n.t('update.installing')
      statusElement.textContent = text
      checkButton.disabled = ['checking', 'downloading', 'installing'].includes(status)
      checkButton.textContent = status === 'checking'
        ? window.I18n.t('settings.update.checking')
        : (state?.updateAvailable ? window.I18n.t('update.install') : window.I18n.t('settings.update.check'))
    },

    showUpdateDialog(state) {
      this._updateInfo = { ...(this._updateInfo || {}), ...state }
      const dialog = document.getElementById('updateDialog')
      document.getElementById('updateMessage').textContent = window.I18n.t('update.message', {
        latest: this._updateInfo.latestVersion,
        current: this._updateInfo.currentVersion || ''
      })
      const notes = String(this._updateInfo.releaseNotes || '').trim()
      document.getElementById('updateNotesWrap').hidden = !notes
      document.getElementById('updateNotes').textContent = notes
      document.getElementById('updateProgressWrap').hidden = true
      document.getElementById('updateProgressFill').style.width = '0%'
      document.getElementById('updateProgressLabel').textContent = window.I18n.t('update.ready')
      document.getElementById('btnUpdateLater').disabled = false
      document.getElementById('btnUpdateNow').disabled = false
      dialog.classList.add('show')
      document.getElementById('btnUpdateNow').focus()
    },

    hideUpdateDialog() {
      const dialog = document.getElementById('updateDialog')
      if (!dialog.classList.contains('show')) return
      if (this._updateInfo?.latestVersion) this._dismissedUpdateVersion = this._updateInfo.latestVersion
      dialog.classList.remove('show')
    },

    async downloadUpdate() {
      const laterButton = document.getElementById('btnUpdateLater')
      const updateButton = document.getElementById('btnUpdateNow')
      laterButton.disabled = true
      updateButton.disabled = true
      document.getElementById('updateProgressWrap').hidden = false
      document.getElementById('updateProgressFill').style.width = '0%'
      document.getElementById('updateProgressLabel').textContent = window.I18n.t('update.preparingDownload')
      document.getElementById('updateMessage').textContent = window.I18n.t('update.message', {
        latest: this._updateInfo?.latestVersion || '',
        current: this._updateInfo?.currentVersion || ''
      })
      try {
        const result = await window.todo.updateDownloadInstall()
        if (!result || !result.ok) {
          const error = this.updateErrorMessage(result?.errorCode, result?.error)
          document.getElementById('updateMessage').textContent = window.I18n.t('update.failed', { error })
          laterButton.disabled = false
          updateButton.disabled = false
        }
      } catch (error) {
        document.getElementById('updateMessage').textContent = window.I18n.t('update.failed', {
          error: this.updateErrorMessage('UPDATE_FAILED', error.message)
        })
        laterButton.disabled = false
        updateButton.disabled = false
      }
    },

    updateErrorMessage(code, fallback = '') {
      const key = `update.error.${code || 'UPDATE_FAILED'}`
      const translated = window.I18n.t(key)
      return translated === key ? (fallback || window.I18n.t('update.error.UPDATE_FAILED')) : translated
    },

    formatBytes(bytes) {
      const value = Number(bytes) || 0
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
      if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
      return `${value} B`
    },

    formatDownloadStatus(state = {}) {
      return window.I18n.t(state.assetType === 'patch' ? 'update.downloadingPatch' : 'update.downloading', {
        percent: state.progress || 0,
        downloaded: this.formatBytes(state.downloadedBytes),
        total: this.formatBytes(state.totalBytes),
        speed: this.formatBytes(state.bytesPerSecond)
      })
    },

    go(view) {
      if (!VIEWS.includes(view)) return

      const locked = window.Store.timer && window.Store.timer.stage === 'recording'
      if (locked && view !== 'record') {
        if (this.current !== 'record') {
          this.toast(window.I18n.t('common.recordFirst'))
          view = 'record'
        } else {
          return
        }
      }

      this.current = view
      document.querySelectorAll('.view').forEach((element) => element.classList.remove('active'))
      const target = document.getElementById('view-' + view)
      if (target) target.classList.add('active')

      if (this._viewHooks[view]) {
        for (const fn of this._viewHooks[view]) fn()
      }
      this.syncNav()
      if (view === 'settings' && this._updateInfo?.updateAvailable
        && this._dismissedUpdateVersion !== this._updateInfo.latestVersion) {
        this.showUpdateDialog(this._updateInfo)
      }
    },

    onView(view, fn) {
      if (!this._viewHooks[view]) this._viewHooks[view] = []
      this._viewHooks[view].push(fn)
    },

    syncNav() {
      const recording = window.Store.timer && window.Store.timer.stage === 'recording'
      const nav = document.getElementById('navDots')
      nav.classList.toggle('hidden', this.current === 'record' || !!recording)
      nav.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.go === this.current)
      })
    },

    toast(msg) {
      const toast = document.getElementById('toast')
      toast.textContent = msg
      toast.classList.add('show')
      clearTimeout(this._toastTimer)
      this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2400)
    }
  }

  window.App = App
  window.addEventListener('DOMContentLoaded', () => App.init())
})()
