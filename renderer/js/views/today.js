/**
 * 桌面 TODO · 今日视图
 * 今日统计、最近记录和手动邮件发送。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const TAG_CLASS = {
    '写代码': '',
    '开会': 'tag-meeting',
    '学习': 'tag-learning',
    '摸鱼': 'tag-rest',
    '喝水': 'tag-learning',
    '散步': 'tag-meeting',
    '刷手机': 'tag-rest',
    '发呆': ''
  }

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

  function setTodayLabel() {
    const now = new Date()
    $('todayDate').textContent = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
    $('todayDatePill').textContent = now.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric'
    })
  }

  async function load() {
    setTodayLabel()
    const data = await window.todo.recordGetToday()
    const { sessions, stats } = data

    $('sumSegs').textContent = stats.segs || 0
    $('sumMins').textContent = stats.minutes || 0
    $('sumBreaks').textContent = stats.breaks || 0
    $('todayMailHint').textContent = `${stats.segs || 0} 个工作段 · ${stats.minutes || 0} 分钟`

    const list = $('todayList')
    list.innerHTML = ''
    if (!sessions.length) {
      list.innerHTML = '<div class="empty-state">今天还没有专注记录</div>'
      return
    }
    for (const session of sessions) {
      list.appendChild(row(session))
    }
  }

  function row(session) {
    const item = document.createElement('div')
    item.className = 'record-item'
    item.style.cursor = 'pointer'

    const start = new Date(session.started_at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
    const accent = ACCENT_COLOR[session.tag] || '#14B8A6'
    const tag = session.tag
      ? `<span class="tag-pill ${tagClass(session.tag)}">${escapeHtml(session.tag)}</span>`
      : ''

    item.innerHTML = `
      <span class="record-accent" style="background:${accent}"></span>
      <div class="record-body">
        <p>${escapeHtml(session.content || '')}</p>
        <div class="record-meta"><span>${session.duration_min} 分钟</span>${tag}</div>
      </div>
      <span class="record-time">${start}</span>
    `

    item.addEventListener('click', () => openEditor(session, 'today'))
    return item
  }

  function openEditor(session, back) {
    window.recordEdit = {
      active: true,
      id: session.id,
      type: session.type === 'break' ? 'break' : 'focus',
      content: session.content || '',
      tag: session.tag || null,
      durationMin: session.duration_min,
      back
    }
    window.App.go('record')
  }

  function tagClass(tag) {
    return TAG_CLASS[tag] || ''
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

  function bind() {
    $('btnSendMail').addEventListener('click', async () => {
      const button = $('btnSendMail')
      button.disabled = true
      button.textContent = '发送中'
      const result = await window.todo.mailSend()
      button.disabled = false
      button.textContent = '发送'

      if (result.ok) {
        window.App.toast('邮件已发送')
      } else {
        window.App.toast(`发送失败：${result.error || '请检查邮箱配置'}`)
      }
    })

    $('btnAddManualToday').addEventListener('click', () => {
      window.recordManual = {
        active: true,
        type: 'focus',
        back: 'today',
        enterAt: Date.now()
      }
      window.App.go('record')
    })

    $('btnViewAllToday').addEventListener('click', () => window.App.go('history'))
    window.App.onView('today', load)
  }

  window.TodayView = { load, row, openEditor, escapeHtml, tagClass }
  bind()
})()
