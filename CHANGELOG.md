# Changelog

## [Unreleased]

## [0.4.2] - 2026-08-04

### 发布

- 发布 Windows x64 NSIS 与 macOS Universal DMG，并继续提供两个平台的签名自动更新包。

### 修复

- macOS 现在会处理访达发送的系统打开事件，支持双击 Markdown 文件和通过“打开方式”载入文档；应用已运行或冷启动时均可正确打开目标文件。

### 构建

- 新增 `pnpm tauri:build:local`，本地构建安装包时不再因缺少自动更新签名私钥而返回失败；正式发布仍生成并签名更新产物。

## [0.4.1] - 2026-08-03

### 发布

- 发布 Windows x64 NSIS 与 macOS Universal DMG，并继续提供两个平台的签名自动更新包。

### 新增

- 文档大纲支持按标题层级折叠和展开子标题。
- 编辑区代码块支持语言选择、语言语法高亮、复制和折叠操作。
- Markdown 预览新增脚注支持，任务列表在只读预览中保持清晰展示。
- 系统托盘菜单支持打开、保存、导出、设置和窗口管理操作，macOS 同时新增系统原生顶部菜单栏。

### 改进

- 编辑与预览切换时保持当前源码位置，并统一滚动容器宽度和滚动条占位，减少视觉跳动。
- 大纲点击在编辑和预览视图中都会将对应标题精确置于内容区顶部。
- 预览代码块保留原始缩进，长行改用横向滚动；代码块折叠状态按源码行稳定保存。
- 所见即所得表格操作改为跟随当前单元格的浮动行列菜单。
- macOS 改用系统原生标题栏和窗口控制按钮，Windows 继续使用自定义标题栏布局。

### 修复

- 修复多行代码块背景和边框断裂、折叠按钮缺失，以及回车新增代码行未连续渲染的问题。
- 修复单个 Mermaid 图表解析失败时影响其他图表渲染的问题，并显示可读的错误信息。
- 仅在 Markdown 内容实际变化时写入文件；切换视图、窗口失焦、关闭或显式保存未修改文档不会刷新文件时间戳。
- 修复 macOS 应用级快捷键只识别 `Ctrl` 的问题，并将菜单提示切换为对应的 `⌘` 组合键。

## [0.4.0] - 2026-07-29

### 发布

- 将当前稳定版本提升为 `0.4.0`，包含预览代码块折叠摘要和现有 Markdown 编辑功能。
- 同时发布 Windows x64 NSIS 与 macOS Universal DMG，macOS 兼容 Intel 和 Apple Silicon。
- 同时生成 Windows 与 macOS 自动更新包、`.sig` 签名和 `latest.json`。
- macOS 安装包保持 unsigned，不依赖 Apple Developer 签名或公证 Secrets。

### 修复

- macOS 标题栏改用左上角红黄绿窗口控制按钮，并保留 Windows 右上角控制布局。

## [0.3.5] - 2026-07-28

### 构建

- 恢复 Windows 和 macOS 的 Tauri 自动更新产物，包括更新包、`.sig` 签名和 `latest.json`。
- macOS 同时生成 Universal DMG 和 Universal 应用更新压缩包，兼容 Intel 与 Apple Silicon。
- 更新清单同时包含 Windows、`darwin-aarch64` 和 `darwin-x86_64`，下载地址通过 `gh-proxy.com`。
- unsigned DMG 仅使用 Tauri 更新签名，不需要 Apple Developer 签名或公证 Secrets。

## [0.3.4] - 2026-07-28

### 新增

- 预览区代码块支持折叠与展开，折叠后显示语言、首个非空代码行和总行数摘要。

### 构建

- 发布工作流同时构建 Windows x64 NSIS 安装包和 macOS Universal DMG。
- 发布前校验 README、前端、Rust 与 Tauri 配置中的版本号，防止文档或版本信息漏更新。
- 安装包发布不再生成 Tauri 更新签名和 `latest.json`，无需配置更新私钥 Secrets。

本项目的重要变更记录在此文件中。

## [0.3.3] - 2026-07-28

### 新增

- 编辑器左侧显示稳定、清晰的行号栏，便于定位 Markdown 源文档内容。
- 关于界面支持通过 Tauri Updater 在应用内检查、下载和安装更新，并显示下载百分比。

### 改进

- 更新检查和安装包下载统一通过 `gh-proxy.com` 镜像传输，改善 GitHub Release 的访问体验。
- 推送 `v*` 标签后由 GitHub Actions 自动构建 NSIS 安装包、签名和 `latest.json`，并创建草稿 Release。

### 安全

- 更新安装包必须通过内置公钥完成签名验证，网络、签名或安装失败时停止更新，不安装未经验证的文件。
- Windows 更新使用 NSIS 被动模式安装，完成后自动重启 LightMarkit。

## [0.3.2] - 2026-07-27

### 修复

- 文档大纲不再收录代码围栏内的 Markdown 标题，并正确处理反引号、波浪线、不同围栏长度和未闭合围栏。

## [0.3.1] - 2026-07-26

### 新增

- 顶部菜单新增“关于”入口，展示应用版本、产品特点、开源许可和项目主页。
- 支持通过 GitHub Release 检查最新版本，并在发现新版本后提供 Windows x64 安装包下载。

### 改进

- 关于界面采用居中产品信息、特性卡片和详情列表布局，并适配明暗主题及窄窗口。
- 更新安装包通过 `gh-proxy.com` 代理地址下载，改善 GitHub Release 的访问体验。
- 外链权限限制为 LightMarkit 项目主页和版本化安装包地址。

### 修复

- 当前版本已是最新版时不再提供重复下载，而是显示明确的最新版本提示。

## [0.3.0] - 2026-07-24

### 新增

- 新增可调整宽度的文档大纲，支持标题层级展示、当前章节高亮和点击跳转。
- 支持恢复文件夹、当前文件、大纲显隐及侧栏宽度等工作区状态。
- 新增当前文件外部变更监听，可在无本地未保存修改时自动刷新内容。

### 改进

- 编辑区与预览区改为按 Markdown 源码块锚点同步滚动，长文档定位更准确。
- 大纲高亮改用视口阅读探针，更贴近当前段落或当前内容块。
- 表格和 Mermaid 图表按块上边界识别，滚动时高亮更稳定。
- 优化预览区顶部间距与渲染复用，减少内容刷新时的视觉位移。

### 修复

- 避免分屏同步滚动反向覆盖实际滚动来源的大纲高亮。
- 避免外部文件更新覆盖尚未保存的本地编辑内容。

## [0.2.0] - 2026-07-16

### 新增

- 在 Markdown 编辑器行首输入 `/` 可打开中文快捷命令菜单。
- 支持正文、三级标题、列表、待办事项、引用、代码块、分隔线、链接、图片和表格等 13 个常用命令。
- 支持中文筛选、键盘导航、Enter 接受和鼠标选择。

### 改进

- 快捷命令菜单默认显示 10 项，并适配明暗主题及窄窗口。
- 表格快捷命令生成左对齐列，预览表头默认左对齐。

### 修复

- 修复编辑模式下 Markdown 标题显示下划线的问题。
- 避免在普通文本和 URL 中误触发快捷命令菜单。

## [0.1.0] - 2026-07-07

### 新增

- 首次正式发布 LightMarkit。
- 支持 Markdown 编辑、实时预览、文件管理、自动保存、Mermaid 图表以及 HTML、PDF 导出。

[Unreleased]: https://github.com/zhtdbobo/LightMarkit/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/zhtdbobo/LightMarkit/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/zhtdbobo/LightMarkit/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.5...v0.4.0
[0.3.5]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/zhtdbobo/LightMarkit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/zhtdbobo/LightMarkit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/zhtdbobo/LightMarkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zhtdbobo/LightMarkit/releases/tag/v0.1.0
