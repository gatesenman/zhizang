#!/usr/bin/env bash
# 一键部署：构建镜像并启动 PostgreSQL + 后端 + 门户（docker compose）。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 选择 docker compose 命令（v2 子命令 / v1 独立命令）
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "未找到 docker compose，请先安装 Docker。" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "==> 未发现 .env，已从 .env.example 生成，请按需修改后重试。"
  cp .env.example .env
fi

echo "==> 构建并启动服务"
$DC up -d --build

echo "==> 等待后端就绪…"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1 || curl -fsS http://localhost:3001/api >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo ""
echo "部署完成："
echo "  后端 API : http://localhost:3001/api"
echo "  开源项目站 : http://localhost:3002"
echo "  数据库   : postgres://zhicang:zhicang@localhost:5432/zhicang"
echo ""
echo "查看日志： $DC logs -f"
echo "停止服务： $DC down"
