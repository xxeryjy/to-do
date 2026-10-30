# 桌面 TODO · Electron 架构备忘

> 技术栈：Electron 31 + 原生 HTML/CSS/JS + better-sqlite3 + nodemailer + electron-updater
> 当前版本：v0.6.0

## 1. 进程模型

- 主进程负责窗口、计时器、SQLite、邮件、更新、系统通知、开机启动和全局快捷键。
- 主窗口与挂件窗口通过 preload 白名单调用 IPC。
- 计时器为唯一主进程实例，状态变化广播到所有窗口。
- 渲染层不直接访问 Node、SQLite 或文件系统。

## 2. 主要模块

```text
main/
├─ index.js          # 生命周期、主窗口、挂件、托盘、开机启动
├─ timer.js          # 计时状态机、任务关联、延长休息
├─ db.js             # SQLite、任务、记录、设置与统计查询
├─ ipc.js            # IPC handlers 和跨窗口事件
├─ auto-mail.js      # 每日与每周自动邮件调度
├─ mailer.js         # QQ SMTP 邮件正文与发送
├─ automation.js     # 专注场景、工作软件启动、DND 降级
├─ shortcuts.js      # 全局自动化快捷键
├─ integrations.js   # 外部平台适配状态
├─ notifications.js  # Windows 系统通知
└─ updater.js        # GitHub Releases 自动更新
```

渲染层：

```text
renderer/
├─ css/candy.css          # 基础暗黑青绿设计 token
├─ css/themes.css         # 主题选择器、任务、排期和洞察共享样式
├─ css/theme-candy.css    # Page 5 糖果风格
├─ css/theme-light.css    # Page 8 浅色工作台
├─ js/views/tasks.js      # 任务、排期、洞察弹窗
├─ js/views/home.js       # 专注与当前任务
├─ js/views/record.js     # 记录与自动草稿
├─ js/views/today.js      # 今日任务、记录、邮件
├─ js/views/history.js    # 历史与搜索
└─ js/views/settings.js   # 主题、计时、系统、自动化设置
```

## 3. 计时状态

```js
state = {
  stage: 'idle' | 'focus' | 'break' | 'recording',
  running: boolean,
  phaseInRound: number,
  totalMs: number,
  remainMs: number,
  startedAt: number|null,
  recordingFor: 'focus' | 'break' | null,
  recordingDurationMin: number|null,
  taskId: number|null,
  taskTitle: string,
  taskProject: string,
  awaitingFocusChoice: boolean,
  awaitingBreakChoice: boolean
}
```

- 到点使用 `Date.now()` 与结束时间戳比较，避免 interval 漂移。
- 专注结束先询问“你累了吗”，休息结束先询问是否继续休息。
- 实际时长写入 `recordingDurationMin`，提前结束和自动草稿均使用该值。
- 工作段可携带任务 ID、标题和项目；进入休息后清空。

## 4. IPC 分组

- 计时：开始、暂停、继续、结束、延长专注、延长休息、完成记录。
- 任务：列表、创建、完成/重开、排期、统计。
- 记录：保存、休息记录、手动记录、编辑、今日、搜索。
- 设置：读取、单项保存、批量保存。
- 邮件：手动发送、自动邮件状态。
- 自动化：专注场景事件、全局快捷键事件。
- 集成：平台列表与连接入口占位。
- 窗口：最小化、拖动、关闭到托盘、挂件展开与置顶。

## 5. 数据与统计

- `sessions.task_id` 关联 `tasks.id`。
- 项目投入通过任务项目聚合工作段分钟数。
- 预估偏差通过任务预估分钟与实际聚合分钟比较。
- 今日任务=所有未完成任务+当天完成任务。
- 旧数据库启动时自动补充新字段。

## 6. 主题

- `dark`：暗黑青绿，底部导航。
- `candy`：糖果风格，底部导航。
- `light`：浅色工作台，左侧竖向导航。
- 主题保存到 `settings.ui_style`，切换后立即应用。
- 挂件同步主题；系统通知保持 Windows 原生样式。

## 7. 自动化

- 自动记录草稿默认只填充表单，不静默保存。
- 自动标签根据任务标题规则推断，项目随任务记录关联。
- 专注场景可启动用户配置的本地 EXE。
- Windows 勿扰模式无稳定公开接口，只提示用户开启专注助手。
- 全局快捷键注册失败时保留应用内快捷键。
- 每周总结统计最近 7 天，失败或跳过状态保存在 settings。

## 8. 外部同步

GitHub、Jira、Notion、Todoist、日历共用 `integrations.js` 适配入口。真实 OAuth、令牌存储和双向同步尚未启用，界面明确显示“未配置”。

## 9. 构建与更新

- 安装版：NSIS + `electron-updater`。
- 便携版：完整包 + zstd 差分补丁回退。
- GitHub Release 需上传安装包、便携版、blockmap 和 `latest.yml`。
- 当前 EXE 未代码签名，可能出现 SmartScreen 提示。