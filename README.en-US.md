

# LightMarkit

<!-- release-version: 0.4.4 -->

LightMarkit is a lightweight desktop Markdown editor built with Tauri 2, React, and TypeScript, supporting Windows and macOS.

Current release version: [v0.4.4](https://github.com/zhtdbobo/LightMarkit/releases/tag/v0.4.4)

## Features

### Editing & Files

- Provides Markdown editing, line numbers, and syntax highlighting using CodeMirror 6.
- Supports opening a single Markdown file or a folder, with document switching in the file tree.
- macOS supports opening Markdown files directly via double-click in Finder or through the "Open With" menu.
- Automatically saves when file content actually changes. Switching between edit/preview, losing window focus, or saving an unmodified document will not rewrite the file, avoiding meaningless timestamp updates.
- Type `/` at the start of a line to access 13 Chinese shortcut commands for quickly inserting headings, lists, todo items, blockquotes, code blocks, links, images, tables, and more.
- Supports Markdown files in UTF-8, UTF-8 BOM, and common legacy encodings.
- Monitors external changes to the current file; prevents direct overwriting when there is unsaved local content.

### Preview

- Real-time Markdown rendering with support for tables, readonly task lists, footnotes, strikethrough, auto-links, and soft line breaks.
- Supports local images via relative paths, absolute paths, and `file://` URLs.
- Supports Mermaid chart rendering.
- Provides two single-column views: Markdown source editing and pure preview. The top-right corner of the content area indicates the toggle shortcut (`Ctrl+/` on Windows or `⌘/` on macOS) and maintains stable reading position and scroll layout.
- Uniformly adjust font and size for both source and preview in settings. Use `Ctrl/⌘++` and `Ctrl/⌘+-` to zoom document content, and `Ctrl/⌘+0` to reset to default size, without affecting the app menu or sidebar.
- Preview code blocks preserve original indentation and horizontal scrolling for long lines. Supports copy and collapse; collapsed blocks display the language, first non-empty line, and total line count.

### Document Organization

- Generates an adjustable-width document outline based on Markdown headings.
- The outline supports collapsing by heading level, highlighting the current section, and clicking to jump and scroll to the top in both edit and preview views. Pseudo-headings inside code fences are excluded from the outline.
- Automatically restores the last opened folder, current file, view layout, and sidebar width.
- Widths for the folder bar, editor area, and outline panel are all adjustable.

### Export & Updates

- Exports to HTML, embedding local images and already rendered Mermaid charts.
- Exports to PDF, reusing preview styles and rendering results.
- App interface adapts to system light/dark appearance.
- Window controls adapted for desktop platforms: Windows uses custom buttons in the top-right corner, while macOS uses the native title bar with red/yellow/green buttons.
- System tray menu supports opening files/folders, saving, exporting, accessing settings, and showing, hiding, or quitting the app; macOS also provides a native top menu bar.
- Supports checking, downloading, and installing signed and verified app updates from the "About" screen.

## Downloads

The automated release process for the current version generates:

- Windows x64 NSIS installer (`.exe`).
- macOS Universal disk image (`.dmg`), compatible with both Intel and Apple Silicon.

- [Download the latest version](https://github.com/zhtdbobo/LightMarkit/releases/latest)

Automated releases also generate Windows and macOS update packages, corresponding `.sig` signatures, and a `latest.json` file containing information for both platforms.

The macOS DMG is not signed with Apple Developer ID nor notarized. It may trigger a Gatekeeper prompt upon first launch, making it suitable for internal use or for running after manual user confirmation.

## Development

### Environment Requirements

- Node.js 22+
- pnpm 11+
- Rust stable
- Windows 10/11, or macOS 12+
- Local macOS builds require Xcode Command Line Tools

### Install Dependencies

```powershell
pnpm install
```

### Common Commands

```powershell
# Launch the full desktop development environment
pnpm tauri dev

# Launch only the Vite frontend service; Tauri API features will not work
pnpm dev

# Run all frontend tests
pnpm test:run

# Run linter
pnpm lint

# Build frontend
pnpm build

# Build desktop app and installer for the current system (no signed update packages)
pnpm tauri:build:local
```

Other commands:

- `pnpm test`: Runs tests in watch mode.
- `pnpm test:ui`: Opens Vitest UI.
- `pnpm test:coverage`: Generates test coverage reports.
- `pnpm format`: Formats TypeScript, TSX, and CSS files under `src`.

## Testing

Frontend uses Vitest, Testing Library, and happy-dom, while the Rust backend uses Cargo tests.

At minimum, run the following before submitting feature modifications:

```powershell
pnpm lint
pnpm test:run
pnpm build
```

When changes involve Tauri configuration, permissions, Rust, file system operations, or export functionality, additionally run:

```powershell
Set-Location src-tauri
cargo test --target-dir target-codex-test
Set-Location ..
pnpm tauri:build:local
```

`pnpm tauri build` generates auto-update artifacts simultaneously and requires setting the `TAURI_SIGNING_PRIVATE_KEY` variable; it is typically only invoked by the GitHub Actions release workflow.

For complete acceptance requirements, see [docs/testing-standard.md](docs/testing-standard.md).

## Tech Stack

### Frontend

- React 19
- TypeScript 5.8
- Vite 7
- CodeMirror 6
- markdown-it
- Mermaid

### Desktop

- Tauri 2
- Rust
- Tauri Dialog, Opener, Process, and Updater plugins
- `notify` for file change monitoring
- `headless_chrome` for PDF export

### Engineering Tools

- pnpm
- ESLint
- Prettier
- Vitest + Testing Library
- GitHub Actions

## Project Structure

```text
LightMarkit/
|-- src/                    # React frontend
|   |-- components/         # Editor, preview, file tree, and outline components
|   |-- utils/              # File, export, rendering, and scroll sync logic
|   |-- test/               # Frontend test configuration
|   |-- App.tsx             # Main app interface and state management
|   `-- main.tsx            # Frontend entry point
|-- src-tauri/              # Tauri/Rust desktop backend
|   |-- capabilities/       # Tauri permission configuration
|   |-- src/                # Rust commands and app entry point
|   |-- tauri.conf.json     # General app, packaging, and update config
|   |-- tauri.local.conf.json # Local build config (no signed update packages)
|   |-- tauri.windows.conf.json # Windows NSIS configuration
|   `-- tauri.macos.conf.json   # macOS DMG configuration
|-- docs/                   # Development standards, plans, and release notes
|-- public/                 # Static assets
|-- CHANGELOG.md            # Version change history
`-- package.json            # Frontend dependencies and scripts
```

## Release Process

The following steps must be completed before creating any version tag:

1. Update the README's features, download instructions, environment requirements, and the top `release-version` marker.
2. Synchronize version numbers in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
3. Update `CHANGELOG.md` and add a version note at `docs/releases/vX.Y.Z.md`.
4. Complete pre-release acceptance checks according to the [testing standards](docs/testing-standard.md).
5. Commit all version files, then create and push the `vX.Y.Z` tag.

GitHub Actions validates the tag, app configuration, and README version before building installers; any version mismatch will halt the release. Upon passing validation, it builds the Windows x64 NSIS, macOS Universal DMG, and signed update packages for both platforms, merging update info into a single `latest.json`. Release requires the `TAURI_SIGNING_PRIVATE_KEY` configuration, but unsigned DMGs do not require any `APPLE_*` secrets.

## Development Plan

Pending features and future milestones can be found at [docs/开发计划.md](docs/开发计划.md). Items in the development plan do not represent currently supported features.

## Contributing

Issues and Pull Requests are welcome. Before submitting code, please verify:

- [ ] New features or behavior changes include tests.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test:run` passes.
- [ ] `pnpm build` passes.
- [ ] User-visible features have been reflected in updated README and CHANGELOG entries.

For commit message format guidelines, see [docs/提交日志规范.md](docs/提交日志规范.md).

## License

[MIT](LICENSE)
