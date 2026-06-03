# CodeHandover

[中文](README.md)

CodeHandover is a desktop tool for generating code handover documents. It reads a local Git repository or a cloned remote repository, builds a per-author responsibility profile, and exports Markdown, HTML, or PDF handover documents.

## Features

- Match Git contributors by email first, reducing responsibility errors caused by display-name collisions.
- Parse commit history, renames, deletions, copies, additions, and modifications while preserving previous path, current path, and current existence state.
- Summarize commit count, contribution date range, added/deleted lines, language distribution, module distribution, high-frequency files, and risky files.
- Attach file-level metadata such as latest commit, first/last contribution date, status counts, and risk reasons.
- Analyze PHP, Go, Java, Python, TypeScript, JavaScript, Vue, C#, C++, Rust, Swift, Kotlin, Dart, Ruby, Elixir, Terraform HCL, Dockerfile, Makefile, and more.
- Generate baseline method notes for branches, loops, transactions, data access, cache usage, external calls, async work, permissions, and file processing.
- Detect common project structures such as Laravel, Gin, Spring Boot, Vue, ThinkPHP, Symfony, Go-Zero, FastAPI, NestJS, Express, React, Next.js, Angular, Nuxt, SvelteKit, Electron, Rails, Sinatra, ASP.NET Core, Flutter, Android, iOS, Phoenix, Ktor, and Tauri.
- Optionally call Claude Code, OpenAI Codex, Gemini CLI, or an OpenAI-compatible API to generate an AI handover summary.
- Export Markdown, HTML, and PDF for editing, browser reading, or archival sharing.

## Git Analysis

The current Git analysis is designed to answer more than “which files did this author touch?”

- Author matching: email-first matching, with name matching as a fallback.
- History parsing: uses `git log --name-status --numstat --find-renames` to identify rename/delete/copy/add/modify changes.
- File profile: records `changeCount`, `commitHashes`, `firstCommitDate`, `lastCommitDate`, `lastCommitHash`, `additions`, `deletions`, and `statusCounts`.
- Contribution profile: exports `languageStats`, `moduleStats`, `riskFiles`, `totalAdditions`, and `totalDeletions`.
- Handover output: adds a “commit timeline and risky files” section with recent commits and priority files to review.

## Tech Stack

- Electron
- Vue 3
- TypeScript
- Vite
- Element Plus
- Tree-sitter WASM

## Requirements

- Node.js 18 or later
- npm
- Git command-line tools
- Windows, macOS, or Linux desktop environment

AI summaries require the matching CLI tool or an OpenAI-compatible API provider configured in the app.

Remote repository tokens are only used as temporary `git clone` credentials. They are not persisted in the cloned `origin` URL.

## Quick Start

```bash
npm install
npm run dev
```

Development mode starts Vite and opens the Electron desktop app.

## Installer Build

```bash
npm run electron:build
```

Local Windows installer artifacts are generated under `release/` and are named like `CodeHandover-Setup-version-x64.exe` by default. The project only builds the Windows x64 NSIS setup installer:

```bash
npm run electron:build:win
```

Windows release packages are built by GitHub Actions. Push a `v*` tag to run `.github/workflows/release.yml`, build unsigned Windows packages, and publish them to GitHub Releases:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release includes only the Windows x64 setup executable and its blockmap. `release/win-unpacked/` is the unpacked debug directory produced by electron-builder and should not be distributed as an official download.

The installer provides a setup wizard, desktop shortcut, Start Menu shortcut, and can launch CodeHandover after installation.

If local packaging fails with `Cannot create symbolic link` or a missing privilege error, enable Windows Developer Mode or rerun `npm run electron:build` from an elevated terminal.

macOS installers are not published for now. macOS users can clone the repository, install dependencies, and run development mode:

```bash
git clone https://github.com/ccTryFlow/code-handover.git
cd code-handover
npm install
npm run dev
```

## Generate A Personal Handover Document

1. Select a local Git repository or enter a remote repository URL.
2. Confirm the branch.
3. Enable Git contributor analysis.
4. Select the handover contributor and optional date range.
5. Start analysis.
6. Generate or open the selected output format from the result page.

Personal handover documents only expand files touched by the selected contributor. Files untouched by that contributor are not treated as part of their responsibility scope.

## Output

A personal document includes:

- Handover scope
- Contribution summary
- Tree-sitter AST language analysis
- Main business areas
- Commit timeline and risky files
- Key source logic and method notes
- Related APIs, commands, tables, and configuration
- High-frequency changed files
- Handover focus and risks
- Follow-up suggestions

## Quality Checks

```bash
npm run typecheck
npm run typecheck:electron
npm run test:core
npm run test:ipc
npm run test:ai-provider
npm run build
npm run check
```

`npm run test:core` creates a temporary Git repository and verifies email-based author matching, rename/delete history, line statistics, risky-file detection, method notes, and Markdown export.

`npm run check` runs release guards, frontend type checks, Electron type checks, core tests, IPC tests, AI provider tests, and the production build. Release guards verify that DevTools is not opened by default, browser-only usage is blocked, and the Windows release target remains an NSIS installer.

## Current Limits

- Method notes are static-rule based and should be treated as a strong first draft, not a replacement for human business context.
- Large files, binary files, dependency directories, build artifacts, and sensitive file contents are skipped.
- Git statistics depend on complete local repository history. Shallow clones should be deepened before analysis.
- Deleted files remain in the responsibility list and risk notes, but their source methods are not expanded.

## Project Structure

```text
src/                    Vue renderer pages, components, and state
electron/main.ts         Electron main process and IPC registration
electron/preload.ts      Safe renderer-facing API bridge
electron/git/            Git branch, author, commit, history, and responsibility analysis
electron/analyzer/       Language, framework, module, AST, and key-file scanning
electron/export/         Markdown, HTML, and PDF document generation
electron/ai/             AI prompts and provider calls
scripts/                 Core, IPC, and AI provider tests
```

## Pre-Release Checklist

- Ensure `.env`, tokens, private repository URLs, and generated handover documents are not committed.
- Run `npm run check`.
- Run `npm run electron:build` to create the installer.
- Push a `v*` tag when you need a Windows GitHub Actions release build.
- Upload only the x64 setup `.exe`, its `.blockmap`, and `latest.yml` from `release/` to GitHub Releases. Do not upload `release/win-unpacked/`.
- Validate the per-author handover flow with at least one real Git repository.
- Review generated documents for sensitive configuration, secrets, or production data.
- For private remote repositories, confirm `.git/config` does not contain tokens in `origin`.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
