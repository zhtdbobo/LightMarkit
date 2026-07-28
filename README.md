# LightMarkit

<!-- release-version: 0.3.4 -->

LightMarkit 是一款基于 Tauri 2、React 和 TypeScript 构建的轻量级桌面 Markdown 编辑器，支持 Windows 和 macOS。

当前发布版本：[v0.3.4](https://github.com/zhtdbobo/LightMarkit/releases/tag/v0.3.4)

## 功能

### 编辑与文件

- 使用 CodeMirror 6 提供 Markdown 编辑、行号和语法样式。
- 支持打开单个 Markdown 文件或文件夹，并在文件树中切换文档。
- 文件内容变更后自动保存，关闭窗口前会等待保存完成。
- 在行首输入 `/` 可使用 13 个中文快捷命令，快速插入标题、列表、待办事项、引用、代码块、链接、图片和表格等内容。
- 支持 UTF-8、UTF-8 BOM 和常见旧编码 Markdown 文件。
- 监听当前文件的外部变更；存在本地未保存内容时不会直接覆盖。

### 预览

- 实时渲染 Markdown，支持表格、任务列表、删除线、自动链接和软换行。
- 支持相对路径、绝对路径和 `file://` 形式的本地图片。
- 支持 Mermaid 图表渲染。
- 提供编辑、分屏和预览三种视图模式。
- 分屏模式下，编辑区与预览区按 Markdown 源码位置同步滚动。
- 预览代码块可以折叠；折叠后显示语言、首个非空代码行和总行数摘要。

### 文档组织

- 根据 Markdown 标题生成可调整宽度的文档大纲。
- 大纲支持当前章节高亮和点击跳转，并会忽略代码围栏内的伪标题。
- 自动恢复上次打开的文件夹、当前文件、视图布局和侧栏宽度。
- 文件夹栏、编辑区和大纲栏宽度均可调整。

### 导出与外观

- 导出 HTML，并嵌入本地图片和已经渲染的 Mermaid 图表。
- 导出 PDF，复用预览样式和渲染结果。
- 应用界面适配系统明暗外观。

## 下载

当前版本的自动发布流程会同时生成：

- Windows x64 NSIS 安装包（`.exe`）。
- macOS Universal 磁盘映像（`.dmg`），兼容 Intel 和 Apple Silicon。

- [下载最新版本](https://github.com/zhtdbobo/LightMarkit/releases/latest)

当前发布仅提供安装包，不生成 Tauri 更新签名或 `latest.json`。升级时请从 Releases 页面手动下载并安装新版本。

macOS DMG 不使用 Apple Developer ID 签名或公证。首次打开时可能出现 Gatekeeper 提示，适合内部使用或由用户手动确认后运行。

## 开发

### 环境要求

- Node.js 22+
- pnpm 11+
- Rust stable
- Windows 10/11，或 macOS 12+
- macOS 本地构建需要 Xcode Command Line Tools

### 安装依赖

```powershell
pnpm install
```

### 常用命令

```powershell
# 启动完整桌面开发环境
pnpm tauri dev

# 仅启动 Vite 前端服务；依赖 Tauri API 的功能不可用
pnpm dev

# 运行全部前端测试
pnpm test:run

# 运行代码检查
pnpm lint

# 构建前端
pnpm build

# 根据当前系统构建桌面应用和安装包
pnpm tauri build
```

其他命令：

- `pnpm test`：监听模式运行测试。
- `pnpm test:ui`：打开 Vitest UI。
- `pnpm test:coverage`：生成测试覆盖率报告。
- `pnpm format`：格式化 `src` 下的 TypeScript、TSX 和 CSS 文件。

## 测试

前端使用 Vitest、Testing Library 和 happy-dom，Rust 后端使用 Cargo 测试。

提交功能修改前至少执行：

```powershell
pnpm lint
pnpm test:run
pnpm build
```

涉及 Tauri 配置、权限、Rust、文件系统或导出功能时，还需要执行：

```powershell
Set-Location src-tauri
cargo test --target-dir target-codex-test
Set-Location ..
pnpm tauri build
```

完整验收要求见 [docs/testing-standard.md](docs/testing-standard.md)。

## 技术栈

### 前端

- React 19
- TypeScript 5.8
- Vite 7
- CodeMirror 6
- markdown-it
- Mermaid

### 桌面端

- Tauri 2
- Rust
- Tauri Dialog、Opener、Process 和 Updater 插件
- `notify` 文件变更监听
- `headless_chrome` PDF 导出

### 工程工具

- pnpm
- ESLint
- Prettier
- Vitest + Testing Library
- GitHub Actions

## 项目结构

```text
LightMarkit/
|-- src/                    # React 前端
|   |-- components/         # 编辑器、预览、文件树和大纲组件
|   |-- utils/              # 文件、导出、渲染和滚动同步逻辑
|   |-- test/               # 前端测试配置
|   |-- App.tsx             # 应用主界面与状态管理
|   `-- main.tsx            # 前端入口
|-- src-tauri/              # Tauri/Rust 桌面端
|   |-- capabilities/       # Tauri 权限配置
|   |-- src/                # Rust 命令与应用入口
|   |-- tauri.conf.json     # 通用应用、打包和更新配置
|   |-- tauri.windows.conf.json # Windows NSIS 配置
|   `-- tauri.macos.conf.json   # macOS DMG 配置
|-- docs/                   # 开发规范、计划和版本说明
|-- public/                 # 静态资源
|-- CHANGELOG.md            # 版本变更记录
`-- package.json            # 前端依赖与脚本
```

## 发布流程

每次创建版本标签前必须完成以下事项：

1. 更新 README 的功能、下载说明、环境要求以及顶部的 `release-version` 标记。
2. 同步 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本号。
3. 更新 `CHANGELOG.md`，并添加 `docs/releases/vX.Y.Z.md` 版本说明。
4. 按 [测试规范](docs/testing-standard.md) 完成发布前验收。
5. 提交所有版本文件后再创建并推送 `vX.Y.Z` 标签。

GitHub Actions 会在构建安装包前校验标签、应用配置和 README 版本；任一版本不一致都会终止发布。校验通过后会构建 Windows x64 NSIS 和 macOS Universal DMG，并创建不依赖 Apple Developer 或 Tauri 更新签名 Secrets 的草稿 Release。

## 开发计划

尚未完成的功能与后续里程碑见 [docs/开发计划.md](docs/开发计划.md)。开发计划中的条目不代表当前已经支持。

## 贡献

欢迎提交 Issue 和 Pull Request。提交代码前请确认：

- [ ] 新功能或行为变更包含测试。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm test:run` 通过。
- [ ] `pnpm build` 通过。
- [ ] 用户可见功能已同步更新 README 和 CHANGELOG。

提交信息格式见 [docs/提交日志规范.md](docs/提交日志规范.md)。

## 许可证

[MIT](LICENSE)
