# 智藏 ZhiCang 后端镜像（NestJS）。从仓库根目录构建：
#   docker build -f apps/backend/Dockerfile -t zhicang-backend .
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# 仅复制清单以利用缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile
# 复制源码并构建
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @zhicang/shared build \
 && pnpm --filter @zhicang/backend build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc LICENSE THIRD_PARTY_NOTICES.md ./
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist
EXPOSE 3001
CMD ["node", "apps/backend/dist/main.js"]
