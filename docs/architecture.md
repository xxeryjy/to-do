# 桌面 TODO · Electron 架构备忘

> 栈：Electron + 原生 HTML/CSS/JS（无前端框架）+ better-sqlite3 + nodemailer
> 依赖：`electron`、`better-sqlite3`、`nodemailer`、`electron-builder`（打包）

---

## 1. 进程模型

```
┌─────────────────────────────────────────────────────────┐
│ 主进程 (main.js)                                         │
│  ├─ 窗口管理：主窗口 + 挂件窗口（置顶无边框）               │
│  ├─ 计时器核心：唯一状态实例（阶段/剩余秒/暂停）            │
│  ├─ 数据库：better-sqlite3 同步读写（仅主进程）            │
│  ├─ 邮件：nodemailer 发信                                 │
│  └─ IPC handler 注册表                                    │
└───────────────▲─────────────────────────▲────────────────┘
                │ IPC invoke/handle       │ 窗口间广播 (webContents.send)
        ┌───────┴────────┐        ┌───────┴────────┐
        │ 主窗口渲染进程   │        │ 挂件窗口渲染进程 │
        │ 六屏 SPA        │        │ 进度条 UI       │
        └────────────────┘        └────────────────┘
```

**核心决策：计时器放主进程。** 原因：① 挂件/主屏共享同一状态，天然同步；② 渲染进程被回收/窗口最小化不影响计时；③ 窗口间只要广播 `timer:tick` 事件即可。

## 2. 窗口配置

### 主窗口
```js
new BrowserWindow({
  width: 420, height: 780, resizable: false,
  frame: false,            // 无边框（糖果风格自绘头部，需自建拖拽区）
  backgroundColor: '#FFF8E7',
  webPreferences: { preload: preload.js, contextIsolation: true }
})
```

### 挂件窗口（迷你进度条）
```js
new BrowserWindow({
  width: 170, height: 32, resizable: false, frame: false,
  transparent: true,       // 圆角胶囊需要透明背景
  alwaysOnTop: true,       // 常驻置顶
  skipTaskbar: true,       // 不占任务栏
  webPreferences: { preload: preload.js, contextIsolation: true }
})
// 更深的置顶层级（可选）：
win.setAlwaysOnTop(true, 'screen-saver')
```

## 3. IPC 通道清单

### 渲染 → 主进程（invoke/handle）
| 通道 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `timer:start` | `{ minutes }` | state | 开始工作段 |
| `timer:pause` | – | state | 暂停 |
| `timer:resume` | – | state | 继续 |
| `timer:stop` | – | state | 结束并丢弃当前段 |
| `timer:skip-break` | – | state | 跳过休息 |
| `record:save` | `{ startedAt, durationMin, content, tag }` | id | 保存工作段记录并进休息（endedAt 由主进程取当前时刻） |
| `record:get-today` | – | sessions[] + stats | 今日列表 |
| `record:search` | `{ kw, range }` | sessions[] + stats | 查找页 |
| `settings:get` | – | 全量 key-value | 启动时拉取 |
| `settings:set` | `{ key, value }` | ok | 单个写入 |
| `mail:send` | – | { ok, error? } | 发今日汇总邮件 |
| `widget:expand` | – | ok | 展开主窗口（挂件双击/点击） |
| `widget:toggle-top` | `{ top }` | – | 置顶开关 |

### 主进程 → 渲染（webContents.send）
| 事件 | 载荷 | 说明 |
|---|---|---|
| `timer:state` | state 全量 | 任何状态变化/每秒 tick 推送 |
| `timer:focus-finished` | `{ startedAt }` | 工作段倒计时结束（主屏弹记录填写） |
| `timer:break-finished` | `{ startedAt, durationMin }` | 休息倒计时结束（主屏弹休息记录填写） |

### 状态对象
```js
state = {
  stage: 'idle' | 'focus' | 'break',
  running: boolean,          // false = 暂停
  phaseInRound: 1..N,        // 本轮第几个工作段
  totalMs: number,           // 本段总时长
  remainMs: number,          // 剩余毫秒
  startedAt: number|null     // 本次开始时间戳（记录填写展示用）
}
```

## 4. 关键实现要点

1. **计时精度**：`setInterval` 每 250ms 读 `Date.now()` 与结束时间戳差值，不累加减法（防漂移）。
2. **防休眠挂起**：每次 tick 都用 `Date.now()` 与结束时间戳求差值（而非累加），系统休眠/挂起恢复后下一个 tick 自然得到正确剩余值，无需额外监听 `powerMonitor`。
3. **记录填写阻塞逻辑**：focus 结束 → 主窗口 `show()` + 切到记录视图；`record:save` 前计时器停在 RECORDING 状态。
4. **SQLite 全部在主进程**：渲染进程绝无直接 DB 访问，全部走 IPC。
5. **QQ SMTP 配置**：
   ```js
   const t = nodemailer.createTransport({
     host: 'smtp.qq.com', port: 465, secure: true,
     auth: { user: qq_email, pass: qq_auth_code } // pass 填授权码，非 QQ 密码
   })
   ```
6. **打包**：electron-builder，`extraResources` 不打 native 模块外的数据；better-sqlite3 需 `electron-rebuild` 匹配 Electron ABI；`asarUnpack` 含 better-sqlite3 与 nodemailer。
7. **无边框拖拽**：头部 `-webkit-app-region: drag`；挂件自定义 mousedown/move 拖动（透明窗口无系统边框）。

## 5. 目录结构（建议）

```
desktop-todo/
├─ package.json
├─ main/
│  ├─ index.js          # 入口，窗口/生命周期
│  ├─ timer.js          # 计时器核心（唯一状态）
│  ├─ db.js             # SQLite 封装
│  ├─ mailer.js         # nodemailer
│  └─ ipc.js            # 全部 IPC handler 注册
├─ preload.js           # contextBridge 暴露 api
├─ renderer/
│  ├─ index.html        # 六屏 SPA（view 切换）
│  ├─ widget.html       # 挂件
│  ├─ css/candy.css     # 糖果风设计 token（单一来源）
│  └─ js/  (views/, store.js)
└─ docs/                # spec.md / database.md / 本文件
```

## 6. 设计 token（糖果风，与设计稿对齐）

```css
:root {
  --cream: #FFF8E7;   /* 页面底 */
  --card: #FFFFFF;
  --ink: #4A2F1A;     /* 主文字（暖棕黑） */
  --ink-2: #8C6F4A;   /* 次文字 */
  --line: #1A1A23;    /* 2px 边框 */
  --pink: #FFB6C1;    --pink-soft: #FFF0F3;
  --lav: #C9B6FF;     --lav-soft: #F0ECFF;
  --butter: #FFE066;  --butter-soft: #FFF8E7;
  --mint: #A8E6CF;    --mint-soft: #F0FBF6;
  /* 硬阴影：0 5px 0 var(--line) */
  --radius-card: 45px; --radius-btn: 14px; --radius-field: 24px;
}
```

> 字体说明：设计稿用 `Outfit`/`Inter` 作展示字体，但项目未打包字体文件、也未写 `@font-face`，实际回退到系统字体（Windows 上为 `PingFang SC`/`Microsoft YaHei`）。若需严格还原设计稿，需将字体文件放入 `assets/` 并补充 `@font-face`。
