/**
 * 桌面 TODO · 今日任务
 * 扁平任务列表、从任务开始专注、完成状态和累计时长。
 */
;(function () {
  const $ = (id) => document.getElementById(id)
  let tasks = []

  function currentTimer() {
    return window.Store.timer || { stage: 'idle', taskId: null }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char])
  }

  function render() {
    const list = $('todayTaskList')
    const timer = currentTimer()
    list.innerHTML = ''

    if (!tasks.length) {
      list.innerHTML = `<div class="task-empty">${window.I18n.t('tasks.empty')}</div>`
      return
    }

    for (const task of tasks) {
      const done = task.status === 'done'
      const active = !done && timer.stage === 'focus' && Number(timer.taskId) === Number(task.id)
      const item = document.createElement('div')
      item.className = `task-row${done ? ' done' : ''}${active ? ' active' : ''}`

      const check = document.createElement('button')
      check.type = 'button'
      check.className = 'task-check'
      check.dataset.action = 'toggle'
      check.dataset.id = task.id
      check.textContent = done ? '✓' : ''
      check.setAttribute('aria-pressed', done ? 'true' : 'false')
      check.setAttribute('aria-label', window.I18n.t(done ? 'tasks.reopen' : 'tasks.complete'))
      check.disabled = active

      const copy = document.createElement('div')
      copy.className = 'task-copy'
      const title = document.createElement('b')
      title.textContent = task.title
      const meta = document.createElement('span')
      const metaParts = [window.I18n.t('tasks.focusedMinutes', { minutes: task.focus_minutes || 0 })]
      if (task.project) metaParts.unshift(task.project)
      if (task.estimate_min) {
        metaParts.push(window.I18n.t('tasks.estimateActual', {
          estimate: task.estimate_min,
          actual: task.focus_minutes || 0
        }))
      }
      if (task.scheduled_start) {
        metaParts.push(window.I18n.formatTime(new Date(task.scheduled_start)))
      }
      meta.textContent = metaParts.join(' · ')
      copy.append(title, meta)

      const start = document.createElement('button')
      start.type = 'button'
      start.className = 'task-start'
      start.dataset.action = 'start'
      start.dataset.id = task.id
      start.textContent = active ? window.I18n.t('tasks.active') : '▶'
      start.title = window.I18n.t(active ? 'tasks.active' : 'tasks.start')
      start.disabled = done || timer.stage !== 'idle'

      item.append(check, copy, start)
      list.appendChild(item)
    }
  }

  async function load() {
    tasks = await window.todo.taskList()
    render()
  }

  function openDialog() {
    $('taskTitleInput').value = ''
    $('taskProjectInput').value = ''
    $('taskEstimateInput').value = ''
    $('taskDialog').classList.add('show')
    $('taskTitleInput').focus()
  }

  function closeDialog() {
    $('taskDialog').classList.remove('show')
  }

  async function createTask(event) {
    event.preventDefault()
    const title = $('taskTitleInput').value.trim()
    if (!title) {
      window.App.toast(window.I18n.t('tasks.toast.titleRequired'))
      $('taskTitleInput').focus()
      return
    }
    $('btnTaskCreate').disabled = true
    try {
      await window.todo.taskCreate({
        title,
        project: $('taskProjectInput').value.trim(),
        estimateMin: $('taskEstimateInput').value
      })
      closeDialog()
      await load()
      window.App.toast(window.I18n.t('tasks.toast.added'))
    } finally {
      $('btnTaskCreate').disabled = false
    }
  }

  async function toggleTask(task) {
    const timer = currentTimer()
    if (timer.stage === 'focus' && Number(timer.taskId) === Number(task.id)) {
      window.App.toast(window.I18n.t('tasks.toast.activeLocked'))
      return
    }
    const completed = task.status !== 'done'
    await window.todo.taskComplete(task.id, completed)
    await load()
    window.App.toast(window.I18n.t(completed ? 'tasks.toast.completed' : 'tasks.toast.reopened'))
  }

  async function startTask(task) {
    if (currentTimer().stage !== 'idle') {
      window.App.toast(window.I18n.t('tasks.toast.locked'))
      return
    }
    const state = await window.todo.timerStart(null, task.id, task.title, task.project || '')
    window.Store.applyTimerState(state)
    window.App.go('home')
    window.App.toast(window.I18n.t('tasks.toast.started', { title: task.title }))
  }

  function scheduleDate(hour = 9) {
    const date = new Date()
    date.setHours(hour, 0, 0, 0)
    return date
  }

  function isScheduledToday(task) {
    if (!task.scheduled_start) return false
    return new Date(task.scheduled_start).toDateString() === new Date().toDateString()
  }

  function makeDraggable(element, task) {
    element.draggable = true
    element.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/task-id', String(task.id))
      event.dataTransfer.effectAllowed = 'move'
    })
  }

  function renderPlanner() {
    const tray = $('plannerTaskTray')
    const grid = $('plannerGrid')
    tray.innerHTML = ''
    grid.innerHTML = ''

    const openTasks = tasks.filter((task) => task.status === 'open')
    const unscheduled = openTasks.filter((task) => !isScheduledToday(task))
    for (const task of unscheduled) {
      const chip = document.createElement('div')
      chip.className = 'planner-task-chip'
      chip.textContent = task.title
      makeDraggable(chip, task)
      tray.appendChild(chip)
    }
    if (!unscheduled.length) {
      tray.innerHTML = `<span class="planner-empty">${window.I18n.t('tasks.planner.none')}</span>`
    }

    for (let hour = 9; hour <= 18; hour += 1) {
      const slot = document.createElement('div')
      slot.className = 'planner-slot'
      slot.dataset.hour = hour
      slot.innerHTML = `<span class="planner-hour">${String(hour).padStart(2, '0')}:00</span>`
      const content = document.createElement('div')
      content.className = 'planner-slot-content'

      const planned = openTasks.filter((task) => isScheduledToday(task) && new Date(task.scheduled_start).getHours() === hour)
      for (const task of planned) {
        const block = document.createElement('div')
        block.className = 'planner-block'
        block.innerHTML = `<b>${escapeHtml(task.title)}</b><span>${task.estimate_min ? window.I18n.t('tasks.minutesShort', { minutes: task.estimate_min }) : ''}</span>`
        makeDraggable(block, task)
        content.appendChild(block)
      }

      slot.appendChild(content)
      slot.addEventListener('dragover', (event) => event.preventDefault())
      slot.addEventListener('dragenter', () => slot.classList.add('drag-over'))
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'))
      slot.addEventListener('drop', async (event) => {
        event.preventDefault()
        slot.classList.remove('drag-over')
        const taskId = Number(event.dataTransfer.getData('text/task-id'))
        const task = tasks.find((item) => Number(item.id) === taskId)
        if (!task) return
        const start = scheduleDate(hour)
        const end = new Date(start.getTime() + Math.max(15, task.estimate_min || 60) * 60000)
        await window.todo.taskSchedule(task.id, start.toISOString(), end.toISOString())
        await load()
        renderPlanner()
        window.App.toast(window.I18n.t('tasks.toast.scheduled', { hour: `${String(hour).padStart(2, '0')}:00` }))
      })
      grid.appendChild(slot)
    }
  }

  function openPlanner() {
    renderPlanner()
    $('plannerDialog').classList.add('show')
  }

  function closePlanner() {
    $('plannerDialog').classList.remove('show')
  }

  async function openInsights() {
    const data = await window.todo.taskStats()
    const bias = data.estimateBias || []
    const projects = data.projects || []
    const totalEstimate = bias.reduce((sum, item) => sum + (item.estimate_min || 0), 0)
    const totalActual = bias.reduce((sum, item) => sum + (item.actual_min || 0), 0)
    $('insightBiasSummary').textContent = window.I18n.t('insights.estimate.summary', {
      estimate: totalEstimate,
      actual: totalActual
    })

    const biasList = $('insightBiasList')
    biasList.innerHTML = ''
    if (!bias.length) {
      biasList.innerHTML = `<div class="insight-empty">${window.I18n.t('insights.estimate.empty')}</div>`
    } else {
      for (const item of bias.slice(0, 5)) {
        const diff = item.actual_min - item.estimate_min
        const row = document.createElement('div')
        row.className = 'insight-row'
        row.innerHTML = `<div><b>${escapeHtml(item.title)}</b><span>${item.project ? escapeHtml(item.project) : window.I18n.t('insights.unassigned')}</span></div><strong>${item.estimate_min} / ${item.actual_min} min</strong><em class="${diff > 0 ? 'late' : 'early'}">${diff > 0 ? '+' : ''}${diff} min</em>`
        biasList.appendChild(row)
      }
    }

    const projectList = $('projectStatsList')
    projectList.innerHTML = ''
    if (!projects.length) {
      projectList.innerHTML = `<div class="insight-empty">${window.I18n.t('insights.projects.empty')}</div>`
    } else {
      const max = Math.max(...projects.map((item) => item.minutes || 0), 1)
      for (const item of projects.slice(0, 6)) {
        const row = document.createElement('div')
        row.className = 'project-bar-row'
        row.innerHTML = `<div><b>${escapeHtml(item.project === 'Unassigned' ? window.I18n.t('insights.unassigned') : item.project)}</b><span>${window.I18n.t('insights.projects.meta', { sessions: item.sessions, tasks: item.tasks })}</span></div><div class="project-bar"><i style="width:${Math.max(6, (item.minutes / max) * 100)}%"></i></div><strong>${window.I18n.t('common.minutes', { count: item.minutes })}</strong>`
        projectList.appendChild(row)
      }
    }

    $('insightsDialog').classList.add('show')
  }

  function closeInsights() {
    $('insightsDialog').classList.remove('show')
  }

  function bind() {
    $('btnAddTask').addEventListener('click', openDialog)
    $('btnOpenPlanner').addEventListener('click', openPlanner)
    $('btnOpenInsights').addEventListener('click', openInsights)
    $('btnTaskCancel').addEventListener('click', closeDialog)
    $('btnPlannerClose').addEventListener('click', closePlanner)
    $('btnInsightsClose').addEventListener('click', closeInsights)
    $('taskForm').addEventListener('submit', createTask)
    $('taskDialog').addEventListener('click', (event) => {
      if (event.target === $('taskDialog')) closeDialog()
    })
    $('plannerDialog').addEventListener('click', (event) => {
      if (event.target === $('plannerDialog')) closePlanner()
    })
    $('insightsDialog').addEventListener('click', (event) => {
      if (event.target === $('insightsDialog')) closeInsights()
    })
    $('taskTitleInput').addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDialog()
    })

    $('todayTaskList').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]')
      if (!button) return
      const task = tasks.find((item) => Number(item.id) === Number(button.dataset.id))
      if (!task) return
      if (button.dataset.action === 'toggle') toggleTask(task)
      if (button.dataset.action === 'start') startTask(task)
    })

    window.Store.onChange(() => render())
  }

  window.TasksView = { load, render, openPlanner, openInsights }
  bind()
})()
