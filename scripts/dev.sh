#!/usr/bin/env bash
# 一键启动开发环境：后端 + 门户 + 桌面端（各自前台日志合并输出）。
# 退出时（Ctrl+C）自动结束所有子进程。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && . ./.env && set +a

echo "==> 安装依赖（如已安装会很快）"
pnpm install

echo "==> 构建共享包"
pnpm --filter @zhicang/shared build >/dev/null 2>&1 || true

PIDS=()
cleanup() {
  echo "\n==> 正在关闭所有服务…"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> 启动后端 (http://localhost:${PORT:-3001}/api)"
pnpm --filter @zhicang/backend start:dev &
PIDS+=("$!")

echo "==> 启动门户 (http://localhost:3002)"
pnpm --filter @zhicang/portal dev &
PIDS+=("$!")

# 桌面端最后启动，避免抢占编译资源
sleep 3
echo "==> 启动桌面端 (Electron)"
pnpm --filter @zhicang/desktop dev &
PIDS+=("$!")

echo "==> 全部已启动。按 Ctrl+C 退出。"
wait
