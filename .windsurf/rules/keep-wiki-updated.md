---
trigger: always_on
description: 保持 wiki/ 知识库与代码/文档同步更新
---

# 规则：文档/代码变更必须同步更新 wiki/

本项目在 `wiki/` 维护一套按 DeepWiki 标准组织的静态知识库。它是项目的权威工程文档，必须与代码保持一致。

## 何时更新 wiki

只要本次改动涉及以下任一项，就**必须**在同一次改动中同步更新 `wiki/` 下对应页面：

- 新增 / 修改 / 删除功能或用户可见行为
- 改动数据模型（SQLite schema、TypeORM 实体、`@zhicang/shared` 类型）
- 改动 IPC API、本地桥接路由、后端 HTTP API、或 MCP 工具
- 改动构建 / 打包 / 部署方式（electron.vite 配置、.npmrc、脚本、CI）
- 改动 README、`.env.example` 等面向用户的文档

## 对应关系（改了哪里 → 更新哪页）

| 改动位置 | 更新页面 |
| --- | --- |
| 整体定位 / 能力清单 | `wiki/00-Overview.md` |
| 架构 / 模块边界 / 进程模型 | `wiki/01-Architecture.md` |
| 安装 / 运行 / 部署 / 环境变量 | `wiki/02-Getting-Started.md` |
| 桌面端主/渲染进程、IPC、桥接、组件 | `wiki/03-Desktop-App.md` |
| 数据模型（schema / 实体 / 共享类型） | `wiki/04-Data-Model.md` |
| 抓取 / AI 富化 / LLM 配置 / AI 面板 | `wiki/05-AI-Enrichment.md` |
| 后端鉴权 / 授权 / 支付 / 邮件 / 同步 / API | `wiki/06-Backend-And-Licensing.md` |
| 付费门户 / 后台 | `wiki/07-Portal.md` |
| 浏览器插件 | `wiki/08-Browser-Extension.md` |
| MCP 工具 | `wiki/09-MCP.md` |
| 打包 / 发布 / 依赖打包策略 / 踩坑 | `wiki/10-Build-And-Release.md` |

## 编写要求

- 内容必须基于真实代码，不臆测；每页底部维护「相关源码」指向具体文件。
- 新增页面时，同时在 `wiki/README.md` 的目录表中登记。
- 表述简洁、中文，与既有页面风格一致；架构/流程优先用 mermaid 图。
- 若改动引入新的打包/运行陷阱，追加到 `wiki/10-Build-And-Release.md` 的「踩坑记录」表。
