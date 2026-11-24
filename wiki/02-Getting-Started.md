# 02 · 快速开始（0.4.0）

完整命令与平台要求见 [README](../README.md#从源码运行)。仅本地桌面无需后端、.env、注册或软件签名密钥。

```bash
pnpm install --frozen-lockfile
pnpm build:shared
pnpm dev:desktop
```

推荐 Node 24 LTS（最低 22.12.0） / pnpm 9.15.1；Linux 原生编译依赖 make、C++、Python 3，Electron 运行需 GTK/NSS/ALSA 等系统库。桌面 better-sqlite3 13 使用 Node-API 预编译。缺失 Electron 二进制时先运行 `pnpm --filter @zhicang/desktop exec install-electron`；原生模块错误运行 `pnpm --filter @zhicang/desktop rebuild`。

可选同步：`pnpm dev:backend`（默认 localhost:3001/api），设置账号后再开启同步。可选项目站 `pnpm dev:portal`（localhost:3002）。`pnpm dev:all` 一起运行三者；`pnpm deploy` 是开发用 Docker 示例，公网部署前必须更改示例凭据并审查安全配置。

环境变量见 .env.example，生产使用强 JWT_SECRET，按需配置 DATABASE_URL、DB_SYNC=false、DB_SSL、CORS_ORIGINS、THROTTLE_TTL/LIMIT。没有许可证密钥、支付、邮件变量要求。

## 相关源码

- package.json、.env.example、docker-compose.yml、scripts/run-*.sh、scripts/dev.sh、scripts/deploy.sh
