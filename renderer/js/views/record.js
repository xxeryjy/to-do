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
  let autoDraftAppliedKey = ''

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
      autoDraftAppliedKey = ''
      $('recSavedAt').textContent = window.I18n.t('record.autoSave.waiting')
    }
  }

  function inferTaskTag(title) {
    if (/代码|开发|修复|bug|code|feature|release|发布/i.test(title)) return '写代码'
    if (/会议|meeting|同步|sync/i.test(title)) return '开会'
    if (/学习|文档|写作|笔记|read|study|writing/i.test(title)) return '学习'
    return null
  }

  function applyAutomationDraft(state, isBreak, durationMin) {
    if (isBreak || !state.taskTitle) return
    if (autoDraftAppliedKey === draftKey) return
    autoDraftAppliedKey = draftKey

    const settings = window.Store.settings || {}
    if (settings.automation_draft_enabled === '1' && !draft) {
      draft = window.I18n.t('automation.draft.content', {
        title: state.taskTitle,
        minutes: durationMin
      })
    }
    if (settings.automation_task_mapping_enabled === '1' && !selectedTag) {
      selectedTag = inferTaskTag(state.taskTitle)
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
    $('recSubtitle').textContent = window.I18n.t(isBreak ? 'record.subtitle.break' : 'app.recordSubtitle')
    $('btnGiveup').hidden = true
    $('btnRecClose').disabled = true
    document.querySelector('.record-actions').classList.add('single')
    setHeader(window.I18n.t(isBreak ? 'record.title.break' : 'record.title.focus'))
    $('recEyebrow').textContent = window.I18n.t('record.eyebrow.current')
    $('recQuestion').textContent = window.I18n.t(isBreak ? 'record.question.break' : 'record.question.focus')
    $('recInput').placeholder = window.I18n.t(isBreak ? 'record.placeholder.break' : 'record.placeholder.focus')
    $('btnSaveRecord').textContent = window.I18n.t(isBreak ? 'record.action.saveNext' : 'record.action.saveBreak')
    $('btnGiveup').textContent = window.I18n.t('record.action.giveup')
    const taskContext = $('recTaskContext')
    taskContext.hidden = isBreak || !state.taskTitle
    $('recTaskTitle').textContent = isBreak
      ? ''
      : [state.taskTitle, state.taskProject].filter(Boolean).join(' · ')

    const startedAt = isBreak
      ? (window.lastBreakStartedAt || state.startedAt || Date.now())
      : (window.lastFocusStartedAt || state.startedAt || Date.now())
    const startDate = new Date(startedAt)
    const now = new Date()
    const stateDuration = state.recordingDurationMin
      || (state.totalMs > 0 ? Math.round(state.totalMs / 60000) : 1)
    const durMin = isBreak
      ? (window.lastBreakDurationMin || stateDuration)
      : (window.lastFocusDurationMin || stateDuration)

    $('recStart').textContent = formatHM(startDate)
    $('recEnd').textContent = formatHM(now)
    $('recDur').textContent = window.I18n.t('record.minutes', { count: durMin })

    applyAutomationDraft(state, isBreak, durMin)
    renderTags(isBreak ? TAGS_BREAK : TAGS_FOCUS)
    $('recInput').value = draft
    updateCount()
  }

  function renderManual() {
    manualType = window.recordManual.type || 'focus'
    document.querySelector('.record-times').style.display = 'none'
    $('manualForm').style.display = 'flex'
    $('manualTypeRow').style.display = 'flex'
    $('recSubtitle').textContent = window.I18n.t('app.recordSubtitle')
    $('btnGiveup').hidden = false
    $('btnRecClose').disabled = false
    document.querySelector('.record-actions').classList.remove('single')
    $('recTaskContext').hidden = true

    setHeader(window.I18n.t('record.title.add'))
    $('recEyebrow').textContent = window.I18n.t('record.eyebrow.manual')
    $('recQuestion').textContent = window.I18n.t('record.question.manual')
    $('recInput').placeholder = window.I18n.t('record.placeholder.generic')
    $('btnSaveRecord').textContent = window.I18n.t('record.action.add')
    $('btnGiveup').textContent = window.I18n.t('record.action.cancel')

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
    $('recSubtitle').textContent = window.I18n.t('app.recordSubtitle')
    $('btnGiveup').hidden = false
    $('btnRecClose').disabled = false
    document.querySelector('.record-actions').classList.remove('single')
    $('recTaskContext').hidden = true

    setHeader(window.I18n.t('record.title.edit'))
    $('recEyebrow').textContent = window.I18n.t(record.type === 'break' ? 'record.eyebrow.break' : 'record.eyebrow.focus')
    $('recQuestion').textContent = window.I18n.t('record.question.edit')
    $('recInput').placeholder = window.I18n.t('record.placeholder.generic')
    $('btnSaveRecord').textContent = window.I18n.t('record.action.saveChanges')
    $('btnGiveup').textContent = window.I18n.t('record.action.cancel')

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
      button.textContent = window.I18n.tagLabel(tag)
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
      $('recSavedAt').textContent = window.I18n.t('record.autoSave.saved', { time: formatHM(new Date()) })
    }, 500)
  }

  function formatHM(date) {
    return window.I18n.formatTime(date)
  }

  function exitRecord() {
    draft = ''
    selectedTag = null
    draftKey = ''
    autoDraftAppliedKey = ''
    $('recInput').value = ''
    $('recSavedAt').textContent = window.I18n.t('record.autoSave.waiting')
    updateCount()

    if (window.Store.timer && window.Store.timer.stage === 'recording') {
      window.recordManual = null
      window.recordEdit = null
      window.App.toast(window.I18n.t('common.recordFirst'))
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
      window.App.toast(window.I18n.t('record.toast.empty'))
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
      window.App.toast(window.I18n.t('record.toast.updated'))
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
      window.App.toast(window.I18n.t('record.toast.added'))
      exitRecord()
      return
    }

    const state = window.Store.timer
    if (mode === 'break') {
      const startedAt = window.lastBreakStartedAt || state.startedAt || Date.now()
      const savedDuration = state.recordingDurationMin || window.lastBreakDurationMin || Math.max(1, Math.round((Date.now() - startedAt) / 60000))
      const result = await window.todo.recordSaveBreak({
        startedAt,
        durationMin: savedDuration,
        content,
        tag: selectedTag
      })
      window.Store.applyTimerState(result.state)
      window.App.toast(window.I18n.t('record.toast.breakSaved'))
    } else {
      const startedAt = window.lastFocusStartedAt || state.startedAt || Date.now()
      const savedDuration = state.recordingDurationMin || window.lastFocusDurationMin
        || (state.totalMs > 0 ? Math.round(state.totalMs / 60000) : 1)
      const result = await window.todo.recordSave({
        startedAt,
        durationMin: savedDuration,
        content,
        tag: selectedTag,
        taskId: state.taskId || null
      })
      window.Store.applyTimerState(result.state)
      window.App.toast(window.I18n.t('record.toast.focusSaved'))
    }

    exitRecord()
  }

  function giveup() {
    if (isEdit() || isManual()) {
      window.App.toast(window.I18n.t('record.toast.cancelled'))
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
