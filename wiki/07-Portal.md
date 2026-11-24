# 07 · 开源项目站（0.4.0）

Next.js 项目站提供产品主线介绍、源码/贡献/发布链接、隐私数据流和第三方费用说明。购码、订单结果、管理后台、退款与商业 EULA 页面及它们的 API 客户端已移除；旧路径返回 404，不再访问支付或许可证服务。

`pnpm dev:portal` 在 localhost:3002 启动，`pnpm build:portal` 构建。它是独立静态内容，无需后端账号或 API 基址；不声明尚未发布的 0.4.0 安装包已存在。

## 相关源码

- apps/portal/app/{page.tsx,layout.tsx,globals.css}
- apps/portal/package.json
