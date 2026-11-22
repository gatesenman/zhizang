#!/usr/bin/env bash
# 启动后端（NestJS）。开发模式 watch；传 prod 走编译产物。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

pnpm --filter @zhicang/shared build

if [ "${1:-dev}" = "prod" ]; then
  pnpm --filter @zhicang/backend build
  pnpm --filter @zhicang/backend start:prod
else
  echo "[backend] 启动开发服务 http://localhost:${PORT:-3001}/api"
  pnpm --filter @zhicang/backend start:dev
fi
