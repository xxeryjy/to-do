/**
 * 桌面 TODO · 专注记录页
 * 支持工作段记录、休息记录、手动添加和编辑已有记录。
 */
;(function () {
  const $ = (id) => document.getElementById(id)

  const TAGS_FOCUS = ['写代码', '开会', '学习', '摸鱼']
  const TAGS_BREAK = ['喝水', '散步', '刷手机', '发呆']
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

  let mode = 'focus'
  let manualType = 'focus'
  let selectedTag = null
  let draft = ''
  let draftKey = ''
  let autoSaveTimer = null

  function isManual() {
    return !!(window.recordManual && window.recordManual.active)
  }

  function isEdit() {
    return !!(window.recordEdit && window.recordEdit.active)
  }

  function currentDraftKey() {
    if (isManual()) return `manual:${window.recordManual.enterAt}`
    if (isEdit()) return `edit:${window.recordEdit.id}`
    const state = window.Store.timer || {}
    return `timer:${state.recordingFor || 'focus'}:${window.lastFocusStartedAt || window.lastBreakStartedAt || state.startedAt || ''}`
  }

  function resetDraftIfNeeded() {
    const key = currentDraftKey()
    if (key !== draftKey) {
      draftKey = key
      draft = ''
      selectedTag = null
    }
  }

  function setHeader(title) {
    $('recTitle').textContent = title
  }

  function updateCount() {
    const length = $('recInput').value.length
    $('recCount').textContent = `${length} / 500`
  }

  function render() {
    resetDraftIfNeeded()
    const state = window.Store.timer

    if (isManual()) {
      mode = 'manual'
      renderManual()
      return
    }
    if (isEdit()) {
      mode = 'edit'
      renderEdit()
      return
    }

    mode = state.recordingFor === 'break' ? 'break' : 'focus'
    $('manualForm').style.display = 'none'
    document.querySelector('.record-times').style.display = 'grid'

    const isBreak = mode === 'break'
    setHeader('专注记录')
    $('recEyebrow').textContent = '本段记录'
    $('recQuestion').textContent = isBreak ? '休息的时候做了什么？' : '这段时间完成了什么？'
    $('recInput').placeholder = isBreak ? '写写休息时的小事…' : '写写这段时间的产出、想法或收获…'
    $('btnSaveRecord').textContent = isBreak ? '保存并继续' : '保存并开始休息'
    $('btnGiveup').textContent = '放弃'

    const startedAt = isBreak
      ? (window.lastBreakStartedAt || state.startedAt || Date.now())
      : (window.lastFocusStartedAt || state.startedAt || Date.now())
    const startDate = new Date(startedAt)
    const now = new Date()
    const stateDuration = state.totalMs > 0 ? Math.round(state.totalMs / 60000) : 1
    const durMin = isBreak
      ? (window.lastBreakDurationMin || stateDuration)
      : (window.lastFocusDurationMin || stateDuration)

    $('recStart').textContent = formatHM(startDate)
    $('recEnd').textContent = formatHM(now)
    $('recDur').textContent = `${durMin} 分钟`

    renderTags(isBreak ? TAGS_BREAK : TAGS_FOCUS)
    $('recInput').value = draft
    updateCount()
  }

  function renderManual() {
    manualType = window.recordManual.type || 'focus'
    document.querySelector('.record-times').style.display = 'none'
    $('manualForm').style.display = 'flex'
    $('manualTypeRow').style.display = 'flex'

    setHeader('添加记录')
    $('recEyebrow').textContent = '手动记录'
    $('recQuestion').textContent = '记录这段完成的内容'
    $('recInput').placeholder = '写点什么…'
    $('btnSaveRecord').textContent = '添加记录'
    $('btnGiveup').textContent = '取消'

    document.querySelectorAll('#manualType .segment-option').forEach((element) => {
      element.classList.toggle('active', element.dataset.mtype === manualType)
    })
    $('manualDuration').value = manualType === 'break' ? '5' : '25'

    renderTags(manualType === 'break' ? TAGS_BREAK : TAGS_FOCUS)
    $('recInput').value = draft
    updateCount()
  }

  function renderEdit() {
    const record = window.recordEdit
    manualType = record.type === 'break' ? 'break' : 'focus'
    document.querySelector('.record-times').style.display = 'none'
    $('manualForm').style.display = 'flex'
    $('manualTypeRow').style.display = 'none'

    setHeader('编辑记录')
    $('recEyebrow').textContent = record.type === 'break' ? '休息记录' : '专注记录'
    $('recQuestion').textContent = '修改这段记录'
    $('recInput').placeholder = '写点什么…'
    $('btnSaveRecord').textContent = '保存修改'
    $('btnGiveup').textContent = '取消'

    $('manualDuration').value = String(record.durationMin || (manualType === 'break' ? 5 : 25))
    if (!draft) draft = record.content || ''
    selectedTag = selectedTag || record.tag || null
    renderTags(manualType === 'break' ? TAGS_BREAK : TAGS_FOCUS)
    $('recInput').value = draft
    updateCount()
  }

  function renderTags(tags) {
    const box = $('recTags')
    box.innerHTML = ''
    for (const tag of tags) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `tag-chip ${TAG_CLASS[tag] || ''}`.trim()
      button.textContent = tag
      button.classList.toggle('selected', selectedTag === tag)
      button.addEventListener('click', () => {
        selectedTag = selectedTag === tag ? null : tag
        renderTags(tags)
      })
      box.appendChild(button)
    }
  }

  function scheduleDraftSave() {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      $('recSavedAt').textContent = `已于 ${formatHM(new Date())} 自动保存`
    }, 500)
  }

  function formatHM(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  function exitRecord() {
    draft = ''
    selectedTag = null
    draftKey = ''
    $('recInput').value = ''
    updateCount()

    if (window.Store.timer && window.Store.timer.stage === 'recording') {
      window.recordManual = null
      window.recordEdit = null
      window.App.toast('请先填写未完成的记录')
      window.App.go('record')
      return
    }

    if (isManual()) {
      const back = window.recordManual.back || 'home'
      window.recordManual = null
      window.App.go(back)
    } else if (isEdit()) {
      const back = window.recordEdit.back || 'home'
      window.recordEdit = null
      window.App.go(back)
    } else {
      window.App.go('home')
    }
  }

  async function saveRecord() {
    const content = $('recInput').value.trim()
    if (!content) {
      window.App.toast('写点内容再保存吧')
      $('recInput').focus()
      return
    }

    const durationMin = Math.max(1, parseInt($('manualDuration').value || '25', 10))

    if (isEdit()) {
      await window.todo.recordUpdate({
        id: window.recordEdit.id,
        durationMin,
        content,
        tag: selectedTag
      })
      window.App.toast('记录已更新')
      exitRecord()
      return
    }

    if (isManual()) {
      await window.todo.recordAddManual({
        type: manualType,
        startedAt: window.recordManual.enterAt || Date.now(),
        durationMin,
        content,
        tag: selectedTag
      })
      window.App.toast('记录已添加')
      exitRecord()
      return
    }

    const state = window.Store.timer
    if (mode === 'break') {
      const startedAt = window.lastBreakStartedAt || state.startedAt || Date.now()
      const savedDuration = window.lastBreakDurationMin || Math.max(1, Math.round((Date.now() - startedAt) / 60000))
      const result = await window.todo.recordSaveBreak({
        startedAt,
        durationMin: savedDuration,
        content,
        tag: selectedTag
      })
      window.Store.applyTimerState(result.state)
      window.App.toast('记录已保存，开始下一段')
    } else {
      const startedAt = window.lastFocusStartedAt || state.startedAt || Date.now()
      const savedDuration = window.lastFocusDurationMin
        || (state.totalMs > 0 ? Math.round(state.totalMs / 60000) : 1)
      const result = await window.todo.recordSave({
        startedAt,
        durationMin: savedDuration,
        content,
        tag: selectedTag
      })
      window.Store.applyTimerState(result.state)
      window.App.toast('记录已保存，开始休息')
    }

    exitRecord()
  }

  function giveup() {
    if (isEdit() || isManual()) {
      window.App.toast('已取消')
      exitRecord()
      return
    }

    if (mode === 'break') {
      window.todo.timerSkipBreak().then(() => exitRecord())
    } else {
      window.todo.timerStop().then(() => exitRecord())
    }
  }

  function bind() {
    $('recInput').addEventListener('input', () => {
      draft = $('recInput').value
      updateCount()
      scheduleDraftSave()
    })

    document.querySelectorAll('#manualType .segment-option').forEach((button) => {
      button.addEventListener('click', () => {
        manualType = button.dataset.mtype
        $('manualDuration').value = manualType === 'break' ? '5' : '25'
        selectedTag = null
        document.querySelectorAll('#manualType .segment-option').forEach((item) => {
          item.classList.toggle('active', item.dataset.mtype === manualType)
        })
        renderTags(manualType === 'break' ? TAGS_BREAK : TAGS_FOCUS)
      })
    })

    $('btnSaveRecord').addEventListener('click', saveRecord)
    $('btnGiveup').addEventListener('click', giveup)
    $('btnRecClose').addEventListener('click', giveup)

    window.App.onView('record', render)
  }

  window.RecordView = { render }
  bind()
})()
