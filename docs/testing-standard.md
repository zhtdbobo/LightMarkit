# LightMarkit 测试规范

本规范用于每次功能修改、重构、依赖调整和发布前验收。后续改动必须按这里的顺序执行，并在结果说明中列出通过项、失败项和已知警告。

## 必跑命令

在仓库根目录执行：

```powershell
pnpm lint
pnpm test:run
pnpm build
```

在 `src-tauri` 目录执行：

```powershell
cargo test --target-dir target-codex-test
```

发布或触及 Tauri 配置、权限、Rust 依赖、窗口控制、文件系统、导出功能时，还必须在仓库根目录执行：

```powershell
pnpm tauri build
```

## 通过标准

- `pnpm lint` 必须 0 error、0 warning。
- `pnpm test:run` 必须全部通过，不允许跳过关键业务测试来换取通过。
- `pnpm build` 必须成功完成 TypeScript 和 Vite 生产构建。
- `cargo test --target-dir target-codex-test` 必须成功编译并执行 Rust 测试。
- `pnpm tauri build` 必须成功生成桌面应用和安装包。
- Vite 的 chunk size warning 目前允许存在，但必须在结果中说明它是性能警告，不是构建失败。

## 功能覆盖要求

涉及对应功能时，必须补充或更新测试：

- 文件菜单：打开文件、打开文件夹、菜单项显示和关闭行为。
- 导出菜单：HTML、PDF、Markdown 导出入口和默认文件名。
- 自动保存：已有文件的内容变更保存、关闭前保存。
- 窗口控制：最小化、最大化、关闭、无标题栏拖拽权限。
- 视图切换：编辑、分屏、预览三种模式和快捷键。
- Tauri 权限：新增前端 Tauri API 调用时，必须同步更新 `src-tauri/capabilities/default.json` 并跑 `pnpm tauri build`。

## 冗余检查

每次 UI 或依赖清理后执行：

```powershell
rg -n "旧类名或旧 API 名" src src-tauri
```

确认：

- 没有未使用的 CSS 类、旧菜单样式、旧标题样式残留。
- 没有未使用的 Tauri 插件、Rust 依赖或前端依赖。
- 删除依赖后必须重新生成并提交对应 lockfile 变化。

## Windows 注意事项

如果 `cargo test` 在默认 `target` 目录出现 `拒绝访问 (os error 5)` 或增量编译文件锁，使用独立目录重跑：

```powershell
cargo test --target-dir target-codex-test
```

如果 `pnpm tauri build` 在受限环境中出现 `spawn EPERM`，需要在具备子进程权限的环境中重跑。单独的 `pnpm build` 通过不能替代 `pnpm tauri build`。

## 结果记录格式

每次验收结果至少包含：

- 本次改动摘要。
- 执行过的命令和结果。
- 失败项、修复方式、重跑结果。
- 已知非阻塞警告。
- 未覆盖风险。
