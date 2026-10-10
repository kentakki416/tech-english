# ==============================================================================
# Stage 1: base - pnpm をインストールしたベースイメージ
# ==============================================================================
FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ==============================================================================
# Stage 2: pruner - turbo prune で cron に必要な workspace だけを抽出
# ==============================================================================
FROM base AS pruner

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN npx -y turbo@2.6.1 prune cron --docker

# ==============================================================================
# Stage 3: installer-builder - 依存インストール + ビルド + 本番依存抽出
# ==============================================================================
FROM base AS installer-builder

WORKDIR /app

COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./

# turbo 経由でビルド。build.dependsOn (^build + @repo/db#prisma:generate) により
# @repo/* (db/logger 等) が先にビルド + Prisma client 生成される。
# pnpm --filter cron build だと @repo/* の dist が無く TS2307 で失敗する。
RUN npx -y turbo@2.6.1 run build --filter=cron

RUN pnpm deploy --filter cron --prod /app/deploy

# ==============================================================================
# Stage 4: runner - 本番実行用の軽量イメージ
# ==============================================================================
FROM node:20-slim AS runner

# tini: ECS Fargate では docker --init が使えないため軽量 init として必須
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node --from=installer-builder /app/deploy/node_modules ./node_modules
COPY --chown=node:node --from=installer-builder /app/deploy/package.json ./package.json
COPY --chown=node:node --from=installer-builder /app/apps/cron/dist ./dist

ENTRYPOINT ["/usr/bin/tini", "--"]

USER node

# デフォルトは cleanup:old-memos。ECS Task Definition の command で
# 別の task に差し替える想定 (例: ["node", "dist/task/heartbeat.js"])。
CMD ["node", "dist/task/cleanup-old-memos.js"]
