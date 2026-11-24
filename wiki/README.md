# 智藏 ZhiCang · 项目知识库（Wiki）

> 本知识库按 [DeepWiki](https://deepwiki.com) 的组织标准，从源码静态抽取生成，作为项目的权威工程文档。
> **维护约定**：任何代码 / 功能 / 文档变更，都应同步更新本 `wiki/` 下对应页面（见 [`.windsurf/rules/keep-wiki-updated.md`](../.windsurf/rules/keep-wiki-updated.md) 与根目录 [`AGENTS.md`](../AGENTS.md)）。

智藏 ZhiCang 是一款 **AI 驱动的跨端收藏夹管理桌面程序**，采用免费开源、本地优先模式：桌面端（Electron）+ 可选同步后端（NestJS）+ 开源项目站（Next.js）+ 浏览器插件（Chrome/Firefox）+ MCP 能力。

## 目录

| # | 页面 | 内容 |
| --- | --- | --- |
| 00 | [项目概览](./00-Overview.md) | 产品定位、能力总览、技术栈、仓库结构 |
| 01 | [系统架构](./01-Architecture.md) | Monorepo 架构、模块边界、进程模型、数据流 |
| 02 | [快速开始](./02-Getting-Started.md) | 环境要求、安装、本地开发、一键部署 |
| 03 | [桌面端](./03-Desktop-App.md) | Electron 主/渲染进程、IPC API、本地桥接、组件 |
| 04 | [数据模型](./04-Data-Model.md) | 桌面端 SQLite/FTS5 schema、后端实体、共享类型 |
| 05 | [AI 富化与 AI 面板](./05-AI-Enrichment.md) | 抓取、富化流水线、LLM 配置、自然语言检索 |
| 06 | [后端与同步](./06-Backend-And-Licensing.md) | 账号认证、自托管同步、旧版无损迁移与安全边界 |
| 07 | [开源项目站](./07-Portal.md) | 产品说明、源码/贡献链接、隐私与第三方费用 |
| 08 | [浏览器插件](./08-Browser-Extension.md) | MV3/MV2、一键收藏、桥接通信、构建 |
| 09 | [MCP 能力](./09-MCP.md) | MCP server 工具、接入 Claude/Cursor |
| 10 | [构建与发布](./10-Build-And-Release.md) | 三端打包、依赖打包策略、自动更新、Lint/Typecheck/Test、CI 校验与发布 |

## 速查

- 本地一键起全栈：`pnpm dev:all`
- 一键 Docker 部署后端+门户：`pnpm deploy`
- 打三端安装包：`pnpm --filter @zhicang/desktop dist:linux|dist:win|dist:mac`
- 本地桥接服务：`http://127.0.0.1:38121`（仅监听本机，插件 + MCP 复用）

## 文档生成说明

本 wiki 内容均基于仓库真实源码抽取，未做臆测。每页底部列出 **相关源码** 指向具体文件，便于核对与跳转。
