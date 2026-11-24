# AGENTS.md · 智能体协作约定

本仓库（智藏 ZhiCang）由人 + AI 智能体协同维护。任何智能体（Windsurf / Cursor / Claude / Devin 等）在本仓库工作时，请遵守以下约定。

## 核心约定：同步更新 wiki/

`wiki/` 是按 [DeepWiki](https://deepwiki.com) 标准组织的项目权威知识库（见 `wiki/README.md`）。

> **任何代码、功能或文档的变更，都必须在同一次改动中同步更新 `wiki/` 下对应页面。**

详细的「改了哪里 → 更新哪页」对应表与编写要求见 [`.windsurf/rules/keep-wiki-updated.md`](./.windsurf/rules/keep-wiki-updated.md)。要点：

- 改数据模型 → `wiki/04-Data-Model.md`
- 改 IPC / 桥接 / 后端 API / MCP 工具 → `wiki/03`、`wiki/06`、`wiki/09`
- 改打包 / 部署 / 依赖策略 → `wiki/02`、`wiki/10`
- 新增页面要在 `wiki/README.md` 目录登记
- 内容必须基于真实代码，每页维护「相关源码」

## 仓库速览

- monorepo（pnpm）：`apps/{desktop,backend,portal,extension,mcp}` + `packages/shared`
- 一键起全栈：`pnpm dev:all`；一键部署：`pnpm deploy`
- 桌面端打包：`pnpm --filter @zhicang/desktop dist:linux|dist:win|dist:mac`
- 本地桥接：`http://127.0.0.1:38121`（插件 + MCP 复用）

## 开发注意

- 桌面端依赖 / `electron.vite.config.ts` / `.npmrc` 改动后，**必须解包当前 Linux ZIP 实测启动（AppImage 暂禁）**，不能只测 dev 模式（见 `wiki/10` 踩坑记录）。
- 渲染层不要在列表 `.map()` 内调用 React hook。
- 不要提交 `keys/` 下私钥、`.env`、`node_modules`、构建产物。
