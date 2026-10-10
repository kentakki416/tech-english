# apps/api セットアップ手順

`apps/api`（Express.js + TypeScript の API サーバー）のローカル開発環境セットアップ手順。設計思想・テスト戦略は [`apps/api/README.md`](../../apps/api/README.md) を参照。

## 目次

- [1. 前提ツール](#1-前提ツール)
- [2. 依存パッケージのインストール](#2-依存パッケージのインストール)
- [3. 環境変数 (.env.keys) の配置](#3-環境変数-envkeys-の配置)
- [4. Postgres / Redis を起動](#4-postgres--redis-を起動)
- [5. マイグレーションとシードデータ](#5-マイグレーションとシードデータ)
- [6. 開発サーバー起動](#6-開発サーバー起動)
- [7. テスト実行](#7-テスト実行)

## 1. 前提ツール

- Node.js >= 18.0.0
- pnpm >= 9.0.0
- Docker (Postgres / Redis をローカル起動するため)

```bash
node --version
pnpm --version
docker --version
```

## 2. 依存パッケージのインストール

ワークスペース全体のインストールは **プロジェクトルートから** 実行する。

```bash
cd <project-root>
pnpm install
```

## 3. 環境変数 (.env.keys) の配置

`apps/api/.env.local` は [dotenvx](https://dotenvx.com/) で暗号化されている。復号鍵 `.env.keys` を管理者から受け取り、**プロジェクトルートに配置**する (`apps/api/.env.keys` はルートへのシンボリックリンク)。

```
<project-root>/
├── .env.keys                       ← ここに配置
└── apps/api/.env.keys              → ../../.env.keys (シンボリックリンク、git 管理)
```

詳細はルート README の [env は dotenvx で管理する](../../README.md#env-は-dotenvx-で管理する) を参照。

> ⚠️ `apps/api` ディレクトリで `cd` してから `dotenvx set` を叩くと、シンボリックリンクが実体ファイルで上書きされて鍵が壊れる。値の追加・更新は **必ずプロジェクトルートから** `npx dotenvx set KEY "value" -f apps/api/.env.local` を実行すること。

## 4. Postgres / Redis を起動

プロジェクトルートの `docker-compose.yaml` で Postgres 16 と Redis 7 が定義されている。

```bash
cd <project-root>
docker compose up -d
docker compose ps           # postgres / redis が healthy か確認
```

| サービス | 接続情報 |
|---|---|
| Postgres | `postgresql://postgres:password@localhost:5433/project-template_dev` |
| Redis | `redis://localhost:6380` |
| ClickHouse | `http://localhost:8124`（DB: `project_template` / user: `default` / password: `password`） |

接続情報は `apps/api/.env.local` の `DATABASE_URL` / `REDIS_HOST` と一致している前提。

## 5. マイグレーションとシードデータ

スキーマとマイグレーションは `packages/db` にあり（Drizzle）、`apps/api` 側のスクリプトから `.env.local` を読み込んで委譲する。詳細は [`packages/db/README.md`](../../packages/db/README.md)。

```bash
pnpm --filter @repo/db prisma:generate   # 併存している Prisma の Client を生成（build に必要）

cd apps/api
pnpm db:migrate             # 未適用の migration を適用
pnpm db:seed                # シードデータ投入 (任意)
pnpm db:studio              # Drizzle Studio で DB を見る (任意)
```

スキーマを変えたときは `pnpm db:generate` で migration を作ってから `pnpm db:migrate` で適用する。

Prisma で migration していた頃から使っているローカル DB は、一度だけ作り直しが要る（[`packages/db/README.md`](../../packages/db/README.md#prisma-で作ったローカル-db-の作り直し一度だけ)）。

## 6. 開発サーバー起動

```bash
cd apps/api
pnpm dev                    # tsx watch でホットリロード (port 8080)

# ヘルスチェック
curl http://localhost:8080/api/health
```

## 7. テスト実行

`apps/api` のテストは「Service ユニットテスト」(DB 不要) と「Controller インテグレーションテスト」(実 DB / 実 Redis 使用) の 2 種類。

```bash
cd apps/api
pnpm test                   # 全テスト (DB_NAME=project-template_test に対して db:migrate 後に実行)
pnpm test test/service      # Service ユニットテストのみ (DB 不要)
pnpm test test/controller   # Controller インテグレーションテストのみ (DB 必要)
pnpm test:watch             # watch モード
pnpm test:coverage          # カバレッジ計測 (coverage/ に出力)
```

> インテグレーションテストはテスト用 DB (`project-template_test`) を使う。DB は Postgres コンテナの初回起動時に `infra/postgres/init/` が作り、`pnpm test` が毎回 `db:migrate` を流す。

テストの設計方針（mock の使い分け、describe の分類ルール、最終状態アサーション等）は [`apps/api/README.md`](../../apps/api/README.md) の「テスト戦略」を参照。
