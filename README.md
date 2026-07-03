# LightMarkit

一个轻量级的 Markdown 编辑器，基于 Tauri + React + TypeScript 构建。

## 特性

- 🚀 基于 Tauri 2 的原生应用性能
- ✏️ CodeMirror 6 编辑器内核
- 📝 实时 Markdown 预览
- 💾 自动保存机制
- 📁 文件夹浏览与多文件管理
- 📊 Mermaid 图表支持
- 📤 多格式导出（HTML、PDF、Markdown）
- 🎨 明暗主题支持
- 🔍 全文搜索功能

## 开发

### 环境要求

- Node.js 20+
- pnpm 8+
- Rust 1.70+

### 安装依赖

```bash
pnpm install
```

### 开发命令

```bash
# 启动开发服务器（前端 + Tauri）
pnpm tauri dev

# 仅启动前端开发服务器
pnpm dev

# 运行测试
pnpm test

# 运行测试（单次运行）
pnpm test:run

# 运行测试并打开 UI 界面
pnpm test:ui

# 生成测试覆盖率报告
pnpm test:coverage

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 构建应用
pnpm tauri build
```

## 测试

本项目采用测试驱动开发（TDD）方式，每个功能都需要编写测试用例。

- **测试框架**：Vitest
- **React 测试**：@testing-library/react
- **最低覆盖率要求**：80%

详细测试规范请参考：[docs/测试规范.md](docs/测试规范.md)

## 开发计划

详细的功能开发计划和进度追踪请查看：[docs/开发计划.md](docs/开发计划.md)

## 技术栈

### 前端
- **框架**：React 19
- **语言**：TypeScript 5.8
- **构建工具**：Vite 7
- **编辑器**：CodeMirror 6
- **Markdown 渲染**：markdown-it

### 后端
- **框架**：Tauri 2
- **语言**：Rust
- **数据库**：SQLite (FTS5)

### 开发工具
- **代码检查**：ESLint
- **代码格式化**：Prettier
- **测试**：Vitest + Testing Library

## 项目结构

```
LightMarkit/
├── src/                    # 前端源码
│   ├── components/        # React 组件
│   ├── hooks/            # 自定义 Hooks
│   ├── utils/            # 工具函数
│   ├── test/             # 测试配置
│   ├── App.tsx           # 根组件
│   └── main.tsx          # 入口文件
├── src-tauri/            # Rust 后端
│   ├── src/
│   │   └── main.rs       # Tauri 主程序
│   └── Cargo.toml        # Rust 依赖配置
├── docs/                 # 项目文档
│   ├── 开发计划.md       # 开发路线图
│   └── 测试规范.md       # 测试规范文档
├── public/               # 静态资源
├── package.json          # Node 依赖配置
├── vite.config.ts        # Vite 配置
└── tsconfig.json         # TypeScript 配置
```

## IDE 推荐配置

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

提交代码前请确保：
- [ ] 所有测试通过 (`pnpm test:run`)
- [ ] 代码通过 lint 检查 (`pnpm lint`)
- [ ] 代码已格式化 (`pnpm format`)
- [ ] 新功能包含测试用例
