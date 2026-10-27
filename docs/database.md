# 桌面 TODO · 数据模型

> 引擎：SQLite（better-sqlite3，同步 API）
> 库文件：`app.getPath('userData')/desktop-todo.db`
> 迁移：启动时 `CREATE TABLE IF NOT EXISTS` 建表，版本字段预留

---

## 1. sessions（工作段/休息记录）

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL DEFAULT 'focus',   -- 'focus' 工作段 | 'break' 休息段
  started_at  TEXT    NOT NULL,                   -- ISO 8601 本地时间，如 2026-08-07T13:00:00+08:00
  ended_at    TEXT    NOT NULL,
  duration_min INTEGER NOT NULL,                  -- 实际分钟数
  content     TEXT,                               -- 记录文本；放弃/休息段为 NULL
  tag         TEXT                                -- 快捷标签，如 '写代码'；无则 NULL
);

-- 查询按日期分组/筛选用
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);
```

### 字段约定
- `started_at` / `ended_at`：统一存带时区偏移的 ISO 字符串，展示时前端本地化。
- `type='break'` 的行也写入（用于统计休息次数），`content`/`tag` 恒为 NULL。
- 「放弃」的工作段**不插入任何行**（不是 content 为空，而是整段不存在）。
- `duration_min`：由主进程计时器累计（暂停不叠加），不是 `ended_at - started_at`，避免跨时区误差。

### 典型查询
```sql
-- 今日记录
SELECT * FROM sessions
WHERE type='focus' AND date(started_at) = date('now','localtime')
ORDER BY started_at DESC;

-- 今日统计
SELECT COUNT(*) AS segs,
       COALESCE(SUM(duration_min),0) AS minutes
FROM sessions WHERE type='focus' AND date(started_at) = date('now','localtime');

-- 搜索（关键词匹配内容或标签）
SELECT * FROM sessions
WHERE type='focus'
  AND (content LIKE '%'||:kw||'%' OR tag LIKE '%'||:kw||'%')
ORDER BY started_at DESC;

-- 日期筛选：今天/昨天/本周/全部（今天为例）
WHERE date(started_at) = date('now','localtime')
-- 昨天
WHERE date(started_at) = date('now','localtime','-1 day')
-- 本周（周一为一周开始，SQLite 默认周日，用 strftime('%W') 或由应用层传起止日期）
WHERE date(started_at) BETWEEN :week_start AND :week_end
```

## 2. settings（键值配置）

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

| key | value 示例 | 说明 |
|---|---|---|
| `qq_email` | `user@qq.com` | QQ 邮箱地址 |
| `qq_auth_code` | `abcdefghijklmn` | QQ SMTP 授权码（16 位） |
| `work_min` | `25` | 工作段分钟 |
| `short_break_min` | `5` | 短休分钟 |
| `long_break_min` | `15` | 长休分钟 |
| `long_break_every` | `4` | 每 N 段长休 |
| `widget_top` | `1` | 挂件置顶开关（'1'/'0'） |
| `schema_version` | `1` | 预留迁移用 |

读取封装：`getSetting(key)` 返回 string（不存在返回默认值）；`setSetting(key,value)` 走 UPSERT。

## 3. 不落库的数据

- 计时器运行时状态（当前阶段、剩余秒数、已暂停）—— 只在主进程内存，崩溃不恢复（MVP 接受）。
- 记录填写草稿 —— 内存防抖保存，重启丢弃（MVP 接受）。
