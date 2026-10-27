/**
 * 桌面 TODO · 渲染层共享状态
 * 订阅主进程广播，维护当前计时器和设置快照。
 */
const Store = {
  timer: null,
  settings: {},

  async init() {
    this.settings = await window.todo.settingsGet()
    this.timer = await window.todo.timerState()

    window.todo.onTimerState((state) => this.applyTimerState(state))

    window.todo.onSettingsChanged(async () => {
      this.settings = await window.todo.settingsGet()
    })
  },

  applyTimerState(state) {
    this.timer = state
    this._emit()
  },

  _listeners: [],
  onChange(cb) {
    this._listeners.push(cb)
  },
  _emit() {
    for (const cb of this._listeners) cb(this.timer)
  }
}

window.Store = Store
