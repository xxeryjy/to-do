/**
 * 桌面 TODO · 全部记录
 * 关键词搜索、日期筛选、按日期分组和结果统计。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  let range = 'today'
  let keyword = ''

  const ACCENT_COLOR = {
    '写代码': '#14B8A6',
    '开会': '#34D399',
    '学习': '#FBBF24',
    '摸鱼': '#7A8290',
    '喝水': '#34D399',
    '散步': '#FBBF24',
    '刷手机': '#7A8290',
    '发呆': '#14B8A6'
  }

  function localDateKey(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function groupLabel(key) {
    const today = localDateKey(new Date())
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = localDateKey(yesterdayDate)
    const date = new Date(`${key}T12:00:00`)
    const short = window.I18n.formatDate(date, { month: 'short', day: 'numeric' })

    if (key === today) return window.I18n.t('history.group.today', { date: short })
    if (key === yesterday) return window.I18n.t('history.group.yesterday', { date: short })
    return window.I18n.formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  async function load() {
    const data = await window.todo.recordSearch(keyword, range)
    const { rows, stats } = data

    $('historyCount').textContent = window.I18n.t('history.count', { count: stats.count })
    $('histCount').textContent = window.I18n.records(stats.count)
    $('histStats').textContent = window.I18n.t('history.minutesFocused', { minutes: stats.minutes })

    const list = $('histList')
    list.innerHTML = ''
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">${window.I18n.t('history.empty')}</div>`
      return
    }

    const groups = new Map()
    for (const row of rows) {
      const key = localDateKey(new Date(row.started_at))
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }

    for (const [dateKey, items] of groups) {
      const group = document.createElement('div')
      group.className = 'history-group'
      const head = document.createElement('div')
      head.className = 'history-group-head'
      head.innerHTML = `<b>${groupLabel(dateKey)}</b><span>${window.I18n.entries(items.length)}</span>`
      group.appendChild(head)
      for (const item of items) group.appendChild(createRow(item))
      list.appendChild(group)
    }
  }

  function createRow(session) {
    const item = document.createElement('div')
    item.className = 'history-record'
    const start = window.I18n.formatTime(new Date(session.started_at))
    const accent = ACCENT_COLOR[session.tag] || '#14B8A6'
    const content = session.content
      ? window.TodayView.escapeHtml(session.content)
      : (session.type === 'break' ? window.I18n.t('history.unrecorded') : '')
    const badge = session.type === 'break'
      ? `<span class="break-pill">${window.I18n.t('history.break')}</span>`
      : ''
    const tag = session.tag
      ? `<span class="tag-pill ${window.TodayView.tagClass(session.tag)}">${window.TodayView.escapeHtml(window.I18n.tagLabel(session.tag))}</span>`
      : ''

    item.innerHTML = `
      <span class="record-time">${start}</span>
      <span class="record-accent" style="background:${accent};min-height:34px"></span>
      <div class="record-body">
        <p>${content}</p>
        <div class="record-meta"><span>${window.I18n.t('record.minutes', { count: session.duration_min })}</span>${badge}${tag}</div>
      </div>
    `

    item.addEventListener('click', () => {
      window.TodayView.openEditor(session, 'history')
    })
    return item
  }

  function bind() {
    let searchTimer = null
    $('histSearch').addEventListener('input', (event) => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        keyword = event.target.value.trim()
        load()
      }, 300)
    })

    document.querySelectorAll('#histFilters .segment-option').forEach((button) => {
      button.addEventListener('click', () => {
        range = button.dataset.range
        document.querySelectorAll('#histFilters .segment-option').forEach((item) => {
          item.classList.toggle('active', item === button)
        })
        load()
      })
    })

    window.App.onView('history', load)
  }

  window.HistoryView = { load }
  bind()
})()
