#!/usr/bin/env bash
# 启动桌面端（Electron + Vite）开发模式。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

pnpm --filter @zhicang/shared build

# 首次运行或换 Node/Electron 版本后，重建原生模块 better-sqlite3
if [ "${1:-}" = "--rebuild" ]; then
  pnpm --filter @zhicang/desktop rebuild
fi

echo "[desktop] 启动 Electron 开发模式（本地桥接服务默认 127.0.0.1:38121）"
pnpm --filter @zhicang/desktop dev
