# ==============================================================================
# Stage 1: base - pnpm をインストールしたベースイメージ
# ==============================================================================
FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ==============================================================================
# Stage 2: pruner - turbo prune で api に必要な workspace だけを抽出
#
# turbo prune --docker は以下を生成する:
#   out/json/  該当ワークスペースの package.json と pnpm-lock.yaml のみ
#   out/full/  該当ワークスペースのソース全部 (build 用)
# ==============================================================================
FROM base AS pruner

WORKDIR /app

# 依存解析に必要な最小ファイルだけコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

# api が必要とする workspace だけを out/ に抽出（npx でビルド時間を削減）
RUN npx -y turbo@2.6.1 prune api --docker

# ==============================================================================
# Stage 3: installer-builder - 依存インストール + ビルド + 本番依存抽出
# ==============================================================================
FROM base AS installer-builder

WORKDIR /app

# Step 1: package.json + lock だけ先にコピーして install (キャッシュ効率化)
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile

# Step 2: ソース全部をコピー
COPY --from=pruner /app/out/full/ ./

# Step 3: API をビルド。turbo 経由で実行することで turbo.json の build.dependsOn
# (^build) により packages/* (@repo/*) が先にビルドされる。
# pnpm --filter api build だと api の tsc しか走らず @repo/* の dist が無く TS2307 になる。
RUN npx -y turbo@2.6.1 run build --filter=api

# Step 4: 本番用依存のみを /app/deploy に抽出
# workspace 依存 (@repo/*) は symlink ではなく実体コピーされる
RUN pnpm deploy --filter api --prod /app/deploy

# ==============================================================================
# Stage 4: runner - 本番実行用の軽量イメージ
# ==============================================================================
FROM node:20-slim AS runner

# tini: Node.js を PID 1 で直接実行すると SIGTERM 等のシグナルを正しく処理できず、
# SIGKILL による強制削除が起きてしまうため軽量 init プロセスとして tini を使用。
# ECS Fargate では docker --init が使えないため必須。
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# installer-builder ステージから本番依存とビルド成果物をコピー
COPY --chown=node:node --from=installer-builder /app/deploy/node_modules ./node_modules
COPY --chown=node:node --from=installer-builder /app/deploy/package.json ./package.json
COPY --chown=node:node --from=installer-builder /app/apps/api/dist ./dist

# Lambda Web Adapter: minimal 構成（Lambda）で Express をそのまま動かすための extension。
# Lambda の実行環境だけが /opt/extensions を読むので、ECS では起動せず何もしない。
# 設計: docs/spec/minimal-deploy/README.md「api を Lambda で動かす」
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0@sha256:17cfd08eff1dfea3f6a9a1e9c65fdac80aa4919b6085e746615530f43f57d2f1 /lambda-adapter /opt/extensions/lambda-adapter

EXPOSE 8080

# ENTRYPOINT: コンテナ起動時に必ず実行されるコマンド。CMD の内容が引数として渡される。
# 実行されるコマンド: /usr/bin/tini -- node dist/index.js
ENTRYPOINT ["/usr/bin/tini", "--"]

# root で実行すると脆弱性を突かれた際にホストへの影響が大きいため、非特権ユーザーで実行
USER node

CMD ["node", "dist/index.js"]
