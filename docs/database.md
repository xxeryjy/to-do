# 桌面 TODO · 数据模型

> 引擎：SQLite（better-sqlite3，同步 API）
> 库文件：`app.getPath('userData')/desktop-todo.db`
> 当前版本：v0.6.0
> 迁移：启动时创建缺失表，并通过 `PRAGMA table_info` 增量补充字段

## 1. sessions（工作段/休息记录）

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL DEFAULT 'focus',
  started_at   TEXT    NOT NULL,
  ended_at     TEXT    NOT NULL,
  duration_min INTEGER NOT NULL,
  content      TEXT,
  tag          TEXT,
  task_id      INTEGER
);
```

- `type`：`focus` 工作段，`break` 休息段。
- `duration_min`：计时器实际时长，不是简单计算结束时间与开始时间之差。
- `task_id`：仅工作段可关联任务；休息段为 `NULL`。
- 旧数据库在启动时自动补充 `task_id` 字段。
- 放弃的工作段不写入记录。

索引：`started_at`、`type`。

## 2. tasks（扁平任务）

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'open',
  created_at      TEXT    NOT NULL,
  completed_at    TEXT,
  estimate_min    INTEGER,
  project         TEXT,
  scheduled_start TEXT,
  scheduled_end   TEXT,
  source          TEXT    NOT NULL DEFAULT 'local',
  external_id     TEXT
);
```

- `status`：`open` 或 `done`。
- `estimate_min`：可选预估分钟。
- `project`：可选项目名，用于项目投入统计。
- `scheduled_start` / `scheduled_end`：拖拽排期后的 ISO 时间。
- `source` / `external_id`：为 GitHub、Jira、Notion、Todoist 等适配层预留。
- 今日页返回所有未完成任务，以及今天完成的任务。
- 任务累计专注分钟数通过 `sessions.task_id` 聚合得到。

## 3. settings（键值配置）

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

主要配置分组：

| 分组 | 示例键 |
| --- | --- |
| 计时 | `work_min`、`short_break_min`、`long_break_min`、`long_break_every`、`delay_focus_min`、`break_extend_min` |
| 语言与主题 | `language`、`ui_style` |
| 邮件 | `qq_email`、`qq_auth_code`、`daily_mail_*`、`weekly_mail_*` |
| 挂件 | `widget_top`、`widget_show_time`、`widget_show_play` |
| 系统 | `launch_at_login`、`notifications_enabled`、`notification_sound_enabled` |
| 自动化 | `automation_draft_enabled`、`automation_task_mapping_enabled`、`focus_scene_enabled`、`focus_scene_dnd_enabled`、`focus_launch_apps_enabled`、`focus_launch_apps`、`shortcuts_enabled` |
| 迁移 | `schema_version` |

- `qq_auth_code` 通过 Electron `safeStorage` 加密后存储。
- `focus_launch_apps` 为 JSON 数组，只保存用户明确填写的本地路径。
- 所有布尔设置使用字符串 `'1'` / `'0'`。

## 4. 主要聚合

### 项目投入

```sql
SELECT COALESCE(NULLIF(TRIM(t.project), ''), 'Unassigned') AS project,
       SUM(s.duration_min) AS minutes
FROM sessions s
JOIN tasks t ON t.id = s.task_id
WHERE s.type = 'focus'
  AND date(s.started_at, 'localtime') >= date('now', 'localtime', 'start of month')
GROUP BY project
ORDER BY minutes DESC;
```

### 预估与实际偏差

```sql
SELECT t.title, t.estimate_min, SUM(s.duration_min) AS actual_min
FROM tasks t
JOIN sessions s ON s.task_id = t.id AND s.type = 'focus'
WHERE t.estimate_min IS NOT NULL
GROUP BY t.id;
```

## 5. 不落库的数据

- 当前计时阶段、剩余时间、暂停状态：主进程内存。
- 记录编辑草稿：当前页面内存，自动生成但保存前不写库。
- OAuth 令牌：当前尚未接入真实平台，不存储模拟令牌。