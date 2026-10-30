<p align="center">
  <img src="./assets/logo-lockup.svg" alt="桌面 TODO" width="420" />
</p>

<p align="center">
  一款面向 Windows 的本地桌面专注计时与工作记录工具
</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white" />
  <img alt="Version" src="https://img.shields.io/badge/version-0.5.1-14B8A6" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
</p>

## 项目简介

桌面 TODO 用简单的循环帮助用户保持专注：

**开始专注 → 到点询问状态 → 记录产出 → 休息 → 下一段专注**

应用以 Windows 桌面常驻工具为使用场景，计时器运行在主进程，主窗口和桌面挂件共享同一计时状态。所有记录和设置保存在本地 SQLite，不依赖账号或云服务。

## 下载

- [前往 GitHub Releases 下载最新版](https://github.com/xxeryjy/to-do/releases/latest)
- [下载 v0.5.1 安装版（推荐）](https://github.com/xxeryjy/to-do/releases/download/v0.5.1/DesktopTODO-Setup-0.5.1.exe)
- [下载 v0.5.1 便携版](https://github.com/xxeryjy/to-do/releases/download/v0.5.1/DesktopTODO-0.5.1-portable.exe)
- [查看 v0.5.1 全部发布文件](https://github.com/xxeryjy/to-do/releases/tag/v0.5.1)

发布包由 GitHub Actions 自动构建并上传。

## 功能

- 专注、暂停、继续、结束与休息倒计时
- 专注到点后内联询问是否疲劳，可直接休息或延长当前专注
- 休息到点后询问是否继续休息，可按设置时长多次延长
- 原始休息与所有延长时间合并为同一条休息记录
- 提前结束专注或休息时，按实际已进行时长进入记录页
- `25 / 30 / 45 / 60` 分钟快速预设
- 工作时长、短休息、长休息、长休频率和延时时长配置
- 专注结束后填写记录、选择快捷标签
- 手动添加记录与编辑已有记录
- 今日数据概览、最近记录和邮件发送
- 按关键词、日期范围搜索历史记录
- 桌面置顶挂件，与主窗口实时同步
- 最小化或隐藏到托盘后继续计时，通过系统通知和提示音提醒计时结束
- 系统通知与提示音可分别开关
- 所有页面提供最小化与关闭按钮，关闭按钮仅隐藏到托盘，不结束进程
- 设置页提供开机启动开关，默认关闭
- 完整中英文界面切换，默认英文
- 基于 GitHub Releases 的安装版差量自动更新
- 便携版自动更新，支持完整包与 zstd 差分补丁回退
- 每日定时自动发送邮件
  - 自动发送默认关闭
  - 无记录日期自动跳过
  - 应用错过发送时间后，下次启动补发上一自然日汇总
  - 发送失败后下次启动重试
- 暗黑青绿、糖果风格和浅色工作台三种 UI，可即时切换并持久化
- 主窗口、挂件、Toast、确认弹窗和记录页面同步主题
- 可拖动无边框窗口与左侧导航浅色主题

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
- electron-updater
- zstd（版本差分补丁）

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

测试覆盖原生模块加载、计时状态机、专注与休息延长流程、提前结束、主要进程模块、自动邮件调度、更新版本判断和渲染层语法。

## 打包

```bash
npm run dist
```

Windows 构建输出：

```text
out/DesktopTODO-Setup-0.5.1.exe
out/DesktopTODO-0.5.1-portable.exe
```

## 应用更新

应用启动后会检查公开 GitHub Releases，并在设置页提供手动检查入口。

安装版使用 `electron-updater` 下载 NSIS 差量块，只获取发生变化的安装包数据；便携版优先使用 `zstd` 差分补丁，补丁失败时自动回退完整 EXE。发现新版本后可以下载并更新，流程包括：

- 显示版本号与更新说明
- 显示已下载大小、总大小和实时下载速度
- 优先下载版本差分补丁，补丁不可用时自动回退完整 EXE
- 校验 SHA256 与 Windows EXE 文件头
- 关闭旧进程、替换便携版 EXE 并重新启动
- 更新失败时保留旧版本
- 下载失败时可直接打开 GitHub Releases 手动下载

自动替换仅支持便携版 EXE。更新包需要通过 SHA256 校验，并建议未来为 Windows EXE 配置代码签名，减少 SmartScreen“未知发布者”提示。

仓库包含 `.github/workflows/release.yml`：推送与 `package.json` 版本一致的 `v*` 标签后，会自动构建安装版和便携版、生成更新元数据、差分补丁及 `.sha256` 文件，并创建 GitHub Release。

从旧版便携 EXE 迁移到安装版仍需手动安装一次；从 `v0.5.0` 起，安装版可使用差量自动更新。`v0.5.1` 通过同一流程发布。

## QQ 邮箱配置

应用默认使用英文界面，可在设置页切换为中文。

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
├─ .github/         # GitHub Actions 发布工作流
├─ assets/          # Logo、应用图标与托盘图标
├─ docs/            # 产品、架构、数据库与需求文档
├─ main/            # Electron 主进程、计时器、数据库、邮件与更新服务
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
- 开机启动按当前可执行文件路径写入；便携版移动目录后可能需要在设置中重新开启。
- 自动邮件只在应用运行时发送；错过后会在下次启动补发上一自然日记录。
- 安装版自动更新依赖公开 GitHub Releases、`latest.yml` 和差量块文件；便携版更新依赖版本标签与 SHA256 校验文件。
- 从旧版便携 EXE 迁移到安装版需要手动安装一次。
- 当前 EXE 尚未进行代码签名，Windows 可能显示“未知发布者”。

## 许可证

[MIT](./LICENSE)
