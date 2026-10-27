<p align="center">
  <img src="./assets/logo-lockup.svg" alt="桌面 TODO" width="420" />
</p>

<p align="center">
  一款面向 Windows 的本地桌面专注计时与工作记录工具
</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white" />
  <img alt="Version" src="https://img.shields.io/badge/version-0.3.0-14B8A6" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
</p>

## 项目简介

桌面 TODO 用简单的循环帮助用户保持专注：

**开始专注 → 倒计时 → 记录产出 → 休息 → 下一段专注**

应用以 Windows 桌面常驻工具为使用场景，计时器运行在主进程，主窗口和桌面挂件共享同一计时状态。所有记录和设置保存在本地 SQLite，不依赖账号或云服务。

## 功能

- 专注、暂停、继续、结束与休息倒计时
- `25 / 30 / 45 / 60` 分钟快速预设
- 工作时长、短休息、长休息和长休频率配置
- 专注结束后填写记录、选择快捷标签
- 手动添加记录与编辑已有记录
- 今日数据概览、最近记录和邮件发送
- 按关键词、日期范围搜索历史记录
- 桌面置顶挂件，与主窗口实时同步
- 每日定时自动发送邮件
  - 自动发送默认关闭
  - 无记录日期自动跳过
  - 应用错过发送时间后，下次启动补发上一自然日汇总
  - 发送失败后下次启动重试
- 暗黑青绿色主题与可拖动无边框窗口

## 界面预览

| 专注主屏 | 设置 |
| --- | --- |
| ![专注主屏](./docs/images/app-main.png) | ![设置](./docs/images/app-settings.png) |

设计需求文档：[docs/需求文档-Page4-青绿色暗黑版.md](./docs/需求文档-Page4-青绿色暗黑版.md)

## 技术栈

- Electron 31
- 原生 HTML / CSS / JavaScript
- better-sqlite3
- nodemailer
- electron-builder

## 环境要求

- Windows 10 / 11
- Node.js 20 或更高版本
- npm

## 安装与运行

```bash
git clone git@github.com:xxeryjy/to-do.git
cd to-do
npm install
npm start
```

`npm install` 会执行 `postinstall`，自动检查并重建与 Electron ABI 匹配的 `better-sqlite3`。

开发模式：

```bash
npm run dev
```

## 测试

```bash
npm test
```

测试覆盖原生模块加载、计时状态机、主要进程模块、自动邮件调度和渲染层语法。

## 打包

```bash
npm run dist
```

Windows 便携版输出到：

```text
out/桌面TODO-0.3.0-便携版.exe
```

## QQ 邮箱配置

1. 在 QQ 邮箱设置中开启 SMTP 服务并生成授权码。
2. 打开应用设置页，填写 QQ 邮箱地址和 SMTP 授权码。
3. 保存后可在今日记录页手动发送汇总。
4. 如需自动发送，开启“每日自动发送”并选择时间。

授权码通过 Electron `safeStorage` 加密后保存在本地。若系统不支持安全存储，则回退为本地明文存储。

## 本地数据

应用数据默认保存在：

```text
%APPDATA%\desktop-todo\desktop-todo.db
```

数据库不会提交到 Git 仓库。卸载或迁移前请自行备份该文件。

## 目录结构

```text
.
├─ assets/          # Logo、应用图标与托盘图标
├─ docs/            # 产品、架构、数据库与需求文档
├─ main/            # Electron 主进程、计时器、数据库和邮件服务
├─ renderer/        # 主窗口、挂件和渲染层视图
├─ scripts/         # 启动、安装检查与冒烟测试
├─ preload.js       # contextBridge 白名单 API
├─ package.json
└─ README.md
```

## 已知限制

- 当前仅提供 Windows 打包配置。
- 使用本地 SQLite，不包含账号、云同步或多设备同步。
- 计时的内存状态不会在应用崩溃后恢复。
- 自动邮件只在应用运行时发送；错过后会在下次启动补发上一自然日记录。
- 不包含应用自动更新功能。

## 许可证

[MIT](./LICENSE)
