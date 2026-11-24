#!/usr/bin/env bash
# 启动开源项目站（Next.js）。开发模式 dev；传 prod 走 build + start。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

if [ "${1:-dev}" = "prod" ]; then
  pnpm --filter @zhicang/portal build
  pnpm --filter @zhicang/portal start
else
  echo "[portal] 启动开发服务 http://localhost:3002"
  pnpm --filter @zhicang/portal dev
fi
