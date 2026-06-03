# CodeHandover

[English](README.en.md)

CodeHandover 是一个桌面端代码交接文档生成工具。它可以读取本地 Git 仓库或远程仓库，按指定 Git 作者、邮箱和时间范围生成个人责任画像，并输出 Markdown、HTML 或 PDF 交接文档。

## 核心能力

- 按 Git 作者邮箱精确匹配提交，避免 display name 冲突导致责任归属错误。
- 解析提交历史、重命名、删除、复制和修改记录，保留旧路径、当前路径和当前文件存在状态。
- 统计个人提交次数、贡献时间范围、增删行、语言分布、模块分布、高频文件和中高风险文件。
- 为每个责任文件标记最近提交、首末提交日期、变更状态次数和风险原因。
- 识别 PHP、Go、Java、Python、TypeScript、JavaScript、Vue、C#、C++、Rust、Swift、Kotlin、Dart、Ruby、Elixir、Terraform HCL、Dockerfile、Makefile 等源码和配置结构。
- 为方法生成基础逻辑备注，例如分支、循环、事务、数据读写、缓存、外部调用、异步任务、权限和文件处理。
- 识别 Laravel、Gin、Spring Boot、Vue、ThinkPHP、Symfony、Go-Zero、FastAPI、NestJS、Express、React、Next.js、Angular、Nuxt、SvelteKit、Electron、Rails、Sinatra、ASP.NET Core、Flutter、Android、iOS、Phoenix、Ktor、Tauri 等项目结构。
- 可选接入 Claude Code、OpenAI Codex、Gemini CLI 或 OpenAI-compatible API 生成 AI 交接摘要。
- 支持输出 Markdown、HTML 和 PDF，兼顾继续编辑、浏览器阅读和归档分享。

## Git 分析优化点

旧版本只偏向“这个作者改过哪些文件”。当前版本会生成更完整的责任画像：

- 作者匹配：优先使用邮箱精确匹配，再兜底匹配姓名。
- 历史解析：使用 `git log --name-status --numstat --find-renames`，识别 rename/delete/copy/add/modify。
- 文件画像：记录 `changeCount`、`commitHashes`、`firstCommitDate`、`lastCommitDate`、`lastCommitHash`、`additions`、`deletions`、`statusCounts`。
- 贡献画像：输出 `languageStats`、`moduleStats`、`riskFiles`、`totalAdditions`、`totalDeletions`。
- 交接文档：新增“提交时间线和风险文件”章节，列出最近提交和优先交接的中高风险文件。

## 技术栈

- Electron
- Vue 3
- TypeScript
- Vite
- Element Plus
- Tree-sitter WASM

## 环境要求

- Node.js 18 或更高版本
- npm
- Git 命令行工具
- Windows、macOS 或 Linux 桌面环境

如果需要 AI 总结，请额外安装并配置对应 CLI，或在应用内配置兼容 OpenAI Chat Completions 的 API。

远程仓库 Token 仅用于本次 `git clone` 的临时鉴权，不会写入克隆后的 `origin` 地址。

## 快速开始

```bash
npm install
npm run dev
```

开发模式会启动 Vite，并通过 Electron 打开桌面应用。

## 正式安装包

```bash
npm run electron:build
```

本地 Windows 安装包会生成在 `release/` 目录下，默认命名为 `CodeHandover-Setup-版本号-x64.exe` 和 `CodeHandover-Setup-版本号-x64.msi`。项目默认只构建 Windows x64 的 NSIS `.exe` 安装向导和 MSI 安装包：

```bash
npm run electron:build:win
```

Windows 发布包由 GitHub Actions 生成。推送 `v*` tag 后，`.github/workflows/release.yml` 会自动构建未签名 Windows 包并发布到 GitHub Releases：

```bash
git tag v1.0.0
git push origin v1.0.0
```

Release 只包含 Windows x64 安装器 `.exe` 和 `.msi`。`release/win-unpacked/` 是 electron-builder 的解包调试目录，`.blockmap` 和 `latest.yml` 是更新元数据，当前都不作为正式下载包提供给用户。

安装包会提供安装向导、桌面快捷方式和开始菜单快捷方式，安装完成后可直接启动 CodeHandover。

如果本机打包时出现 `Cannot create symbolic link` 或“客户端没有所需的特权”，请开启 Windows 开发者模式，或用管理员终端重新执行 `npm run electron:build`。

macOS 暂不提供安装包。macOS 用户可以自行 clone 仓库后安装依赖并运行开发模式：

```bash
git clone https://github.com/ccTryFlow/code-handover.git
cd code-handover
npm install
npm run dev
```

## 生成个人交接文档

1. 选择本地 Git 仓库，或输入远程仓库地址拉取代码。
2. 确认分析分支。
3. 开启 Git 作者分析。
4. 选择交接人员和时间范围。
5. 开始分析。
6. 在结果页生成或打开交接文档。

个人交接文档只展开该作者提交历史涉及的文件，不会把未修改过的模块误当作个人责任范围。

## 输出内容

个人文档会包含：

- 交接范围说明
- 个人贡献摘要
- Tree-sitter AST 语言分析
- 主要负责业务域
- 提交时间线和风险文件
- 关键代码逻辑和方法备注
- 个人涉及接口、命令、数据表和配置
- 高频修改文件清单
- 交接重点和风险
- 后续补充建议

## 质量检查

```bash
npm run typecheck
npm run typecheck:electron
npm run test:core
npm run test:ipc
npm run test:ai-provider
npm run build
npm run check
```

`npm run test:core` 会创建临时 Git 仓库，验证作者邮箱匹配、rename/delete 历史、增删行统计、风险文件识别、方法逻辑备注和 Markdown 导出。

`npm run check` 会依次执行发布保护检查、前端类型检查、Electron 类型检查、核心链路测试、IPC 测试、AI Provider 测试和生产构建。发布保护检查会确认 DevTools 不会默认打开、网页环境不能直接当应用使用、Windows 发布目标只保留 x64 `.exe` 和 `.msi` 安装包。

## 当前边界

- 方法逻辑备注来自静态规则推断，适合作为交接初稿，仍建议负责人补充真实业务规则、异常场景、接口示例和测试入口。
- 大文件、二进制文件、依赖目录、构建产物和敏感文件内容会被跳过。
- Git 作者统计依赖本地仓库提交历史完整性；浅克隆仓库需要先补全历史。
- 已删除文件只会在责任清单和风险说明中保留历史，不会尝试展开当前不存在的源码方法。

## 项目结构

```text
src/                   Vue 渲染进程页面、组件和状态管理
electron/main.ts        Electron 主进程和 IPC 注册
electron/preload.ts     安全暴露给渲染进程的 API
electron/git/           Git 分支、作者、提交、历史和责任文件分析
electron/analyzer/      语言、框架、模块、AST 和关键文件扫描
electron/export/        Markdown、HTML 和 PDF 交接文档生成
electron/ai/            AI 提示词和 Provider 调用
scripts/                核心链路、IPC 和 AI Provider 测试
```

## 开源前检查清单

- 确认 `.env`、Token、私有仓库地址和生成的交接文档没有被提交。
- 运行 `npm run check`。
- 运行 `npm run electron:build` 生成安装包。
- 如需发布 Windows 安装包，推送 `v*` tag 触发 GitHub Actions Release workflow。
- GitHub Release 只上传 `release/` 下的 x64 安装器 `.exe` 和 `.msi`，不要上传 `.blockmap`、`latest.yml` 或 `release/win-unpacked/`。
- 用至少一个真实 Git 仓库验证“按作者生成个人文档”的主流程。
- 检查生成文档中是否包含敏感配置、密钥或生产数据。
- 如使用远程私有仓库，确认 `.git/config` 中的 `origin` 不包含 Token。

## 许可证

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
