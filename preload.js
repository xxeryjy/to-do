/**
 * 桌面 TODO · preload
 * 用 contextBridge 暴露白名单 API 给渲染进程，保持 contextIsolation。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('todo', {
  // 计时器
  timerSetDuration: (minutes) => ipcRenderer.invoke('timer:set-duration', { minutes }),
  timerStart: (minutes, taskId, taskTitle, taskProject) => ipcRenderer.invoke('timer:start', { minutes, taskId, taskTitle, taskProject }),
  timerPause: () => ipcRenderer.invoke('timer:pause'),
  timerResume: () => ipcRenderer.invoke('timer:resume'),
  timerStop: () => ipcRenderer.invoke('timer:stop'),
  timerFinishFocus: () => ipcRenderer.invoke('timer:finish-focus'),
  timerExtendFocus: () => ipcRenderer.invoke('timer:extend-focus'),
  timerEndFocusEarly: () => ipcRenderer.invoke('timer:end-focus-early'),
  timerEndBreakEarly: () => ipcRenderer.invoke('timer:end-break-early'),
  timerFinishBreak: () => ipcRenderer.invoke('timer:finish-break'),
  timerExtendBreak: () => ipcRenderer.invoke('timer:extend-break'),
  timerSkipBreak: () => ipcRenderer.invoke('timer:skip-break'),
  timerState: () => ipcRenderer.invoke('timer:state'),

  // 记录
  recordSave: (payload) => ipcRenderer.invoke('record:save', payload),
  recordSaveBreak: (payload) => ipcRenderer.invoke('record:save-break', payload),
  recordAddManual: (payload) => ipcRenderer.invoke('record:add-manual', payload),
  recordUpdate: (payload) => ipcRenderer.invoke('record:update', payload),
  recordGetToday: () => ipcRenderer.invoke('record:get-today'),
  recordSearch: (kw, range) => ipcRenderer.invoke('record:search', { kw, range }),

  // 任务
  taskList: () => ipcRenderer.invoke('task:list'),
  taskCreate: (payload) => ipcRenderer.invoke('task:create', typeof payload === 'string' ? { title: payload } : payload),
  taskComplete: (id, completed) => ipcRenderer.invoke('task:complete', { id, completed }),
  taskSchedule: (id, scheduledStart, scheduledEnd) => ipcRenderer.invoke('task:schedule', { id, scheduledStart, scheduledEnd }),
  taskStats: () => ipcRenderer.invoke('task:stats'),

  // 外部工具适配层
  integrationsList: () => ipcRenderer.invoke('integrations:list'),
  integrationConnect: (providerId) => ipcRenderer.invoke('integrations:connect', { providerId }),

  // 设置
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  settingsSetMany: (values) => ipcRenderer.invoke('settings:set-many', values),

  // 邮件
  mailSend: () => ipcRenderer.invoke('mail:send'),
  mailAutoStatus: () => ipcRenderer.invoke('mail:auto-status'),

  // 应用更新
  updateCheck: (options) => ipcRenderer.invoke('update:check', options),
  updateDownloadInstall: () => ipcRenderer.invoke('update:download-install'),
  openReleasePage: () => ipcRenderer.invoke('app:open-release'),

  // 窗口
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMoveBy: (dx, dy) => ipcRenderer.send('window:move-by', { dx, dy }),
  windowCloseToTray: () => ipcRenderer.invoke('window:close-to-tray'),
  widgetExpand: () => ipcRenderer.invoke('widget:expand'),
  widgetToggleTop: (top) => ipcRenderer.invoke('widget:toggle-top', { top }),

  // 主进程 → 渲染 事件订阅
  onTimerState: (cb) => ipcRenderer.on('timer:state', (_e, state) => cb(state)),
  onTimerNotificationSound: (cb) => ipcRenderer.on('timer:notification-sound', () => cb()),
  onFocusAwaitingChoice: (cb) => ipcRenderer.on('timer:focus-awaiting-choice', (_e, payload) => cb(payload)),
  onBreakAwaitingChoice: (cb) => ipcRenderer.on('timer:break-awaiting-choice', (_e, payload) => cb(payload)),
  onFocusFinished: (cb) => ipcRenderer.on('timer:focus-finished', (_e, payload) => cb(payload)),
  onBreakFinished: (cb) => ipcRenderer.on('timer:break-finished', (_e, payload) => cb(payload)),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, payload) => cb(payload)),
  onAutoMailStatus: (cb) => ipcRenderer.on('mail:auto-status', (_e, payload) => cb(payload)),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, payload) => cb(payload)),
  onFocusScene: (cb) => ipcRenderer.on('automation:focus-scene', (_e, payload) => cb(payload)),
  onAutomationShortcut: (cb) => ipcRenderer.on('automation:shortcut', (_e, action) => cb(action))
})
