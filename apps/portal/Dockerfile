# 智藏 ZhiCang 付费门户镜像（Next.js）。从仓库根目录构建：
#   docker build -f apps/portal/Dockerfile -t zhicang-portal .
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_API_BASE=http://localhost:3001/api
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/portal/package.json apps/portal/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/portal apps/portal
RUN pnpm --filter @zhicang/shared build \
 && pnpm --filter @zhicang/portal build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/portal/package.json apps/portal/
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/portal/.next apps/portal/.next
COPY --from=build /app/apps/portal/public apps/portal/public
COPY --from=build /app/apps/portal/next.config.* apps/portal/
EXPOSE 3002
CMD ["pnpm", "--filter", "@zhicang/portal", "start"]
