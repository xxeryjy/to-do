/**
 * 桌面 TODO · 渲染层 SPA 控制器
 * 页面切换、主导航、Toast、全局快捷键和启动初始化。
 */
;(function () {
  const VIEWS = ['home', 'record', 'today', 'settings', 'history']
  const NAV = [
    { view: 'home', label: '专注' },
    { view: 'today', label: '今日' },
    { view: 'history', label: '历史' },
    { view: 'settings', label: '设置' }
  ]

  const App = {
    current: 'home',
    _viewHooks: {},

    async init() {
      await window.Store.init()

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
        button.textContent = item.label
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
      this.bindGlobalShortcuts()
      this.bindAutoMailStatus()

      window.HomeView && window.HomeView.render(window.Store.timer)
      window.HomeView && window.HomeView.refreshStats && window.HomeView.refreshStats()
      this.syncNav()
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

    confirm({ title = '确认操作', message = '', confirmText = '确认', cancelText = '取消' } = {}) {
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
          this.toast(`已自动发送 ${payload.date} 的记录汇总`)
        } else if (payload.type === 'error') {
          this.toast(`自动发送失败：${payload.error || '请检查邮箱配置'}`)
        }
      })
    },

    go(view) {
      if (!VIEWS.includes(view)) return

      const locked = window.Store.timer && window.Store.timer.stage === 'recording'
      if (locked && view !== 'record') {
        if (this.current !== 'record') {
          this.toast('请先完成记录填写')
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
