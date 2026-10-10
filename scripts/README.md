# scripts

本リポジトリのオペレーション系シェルスクリプト置き場。

## 目次

- [一覧](#一覧)
- [seed-secrets.sh](#seed-secretssh)
  - [前提条件](#前提条件)
  - [使い方](#使い方)
  - [destroy / apply サイクルでの典型的な使い方](#destroy--apply-サイクルでの典型的な使い方)
  - [トラブルシュート](#トラブルシュート)
  - [直接 AWS Console で値を確認したいとき](#直接-aws-console-で値を確認したいとき)
- [setup-labels.sh](#setup-labelssh)
  - [前提条件](#前提条件-1)
  - [使い方](#使い方-1)

## 一覧

誰がいつ実行するかでディレクトリを分けている。新しいスクリプトもこのどれかに置く。

- `setup/`: プロジェクト作成時に 1 回だけ人が実行する
- `deploy/`: `terraform apply` の後など、デプロイ作業で人が繰り返し実行する
- `ci/`: GitHub Actions から呼ばれる（人は直接実行しない）

| スクリプト | 用途 |
|---|---|
| `setup/copy-template.sh` | テンプレートから新規プロジェクトを作成（手順はルートの [README](../README.md#新規プロジェクトを作る)） |
| [setup/setup-labels.sh](#setup-labelssh) | `.github/labeler.yml` が付与する PR ラベルを GitHub リポジトリに作成 |
| [deploy/seed-secrets.sh](#seed-secretssh) | apply 後に AWS Secrets Manager へ外部 secret と RDS / Redis 接続情報を投入 |
| `ci/turbo-scope.sh` | lint / test を変更の影響範囲だけ実行（`lint.yml` / `test.yml` から呼ばれる） |
| `ci/turbo-scope.test.sh` | `turbo-scope.sh` の判定のテスト。判定を変えたらローカルで実行する |

---

## seed-secrets.sh

`terraform apply` で作成された Secrets Manager の箱 (`/project-template-<env>/app`) に、以下の値を一括投入する:

| Key | 出所 | 自動 / 手動 |
|---|---|---|
| `DATABASE_URL` | `terraform output` + RDS の AWS 管理パスワード | **自動構築** |
| `REDIS_HOST` | `terraform output` (step5 で activate) | **自動構築** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 環境変数 | **要 export** |
| `LIVEKIT_HOST` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_WEBHOOK_SECRET` | 環境変数 | **要 export** |
| `FRONTEND_URL` | 環境変数 | **要 export** |
| `JWT_*` / `NODE_ENV` / `PORT` 等 | （Terraform 投入済み、触らない） | - |

特徴:
- **idempotent**: 何度実行しても OK。未設定の key は skip + warn
- **段階的**: RDS / ElastiCache がまだ deploy されていなくても、揃っている分だけ投入
- **merge ベース**: 既存の Terraform 投入値 (JWT 等) を上書きしない

### 前提条件

#### 1. CLI ツール

| コマンド | インストール例 (macOS) |
|---|---|
| `aws` (CLI v2) | `brew install awscli` |
| `jq` | `brew install jq` |
| `terraform` | `brew install terraform` |

#### 2. AWS 認証

`aws sts get-caller-identity` が通る状態が必要。3 通りの設定方法のいずれか:

##### (a) `aws configure` で固定 access key を保存

```bash
aws configure
# AWS Access Key ID:     AKIA...
# AWS Secret Access Key: ...
# Default region name:   ap-northeast-1
# Default output format: json
```

##### (b) AWS SSO (推奨、組織で SSO を使っている場合)

```bash
aws configure sso
aws sso login --profile <profile-name>
export AWS_PROFILE=<profile-name>
```

##### (c) 環境変数で直接

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="ap-northeast-1"
```

確認:

```bash
aws sts get-caller-identity
# 自分のアカウント ID と ARN が返ればOK
```

#### 3. Terraform backend 接続

スクリプトは `terraform output` で値を引くため、対象 env で `terraform init` が済んでいる必要がある:

```bash
cd infra/terraform/aws/env/dev
terraform init
```

#### 4. 環境変数の設定

`seed-secrets.sh` は以下の環境変数を読む:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
LIVEKIT_HOST
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
LIVEKIT_WEBHOOK_SECRET
FRONTEND_URL
```

設定方法は 2 つ。**(a) を推奨** (`apps/api/.env.local` がすでに dotenvx 暗号化済みで `.env.keys` も symlink で揃っているため、追加セットアップ不要)。

##### (a) dotenvx 経由で `apps/api/.env.local` を流す（推奨）

```bash
npx dotenvx run -f apps/api/.env.local -- ./scripts/deploy/seed-secrets.sh dev
```

- `apps/api/.env.local` で既に管理している GOOGLE / LIVEKIT 等の値がそのまま使われる
- AWS dev 用に上書きしたい値があれば事前に `export` しておけば優先される:

  ```bash
  FRONTEND_URL="https://project-template-xxx.vercel.app" \
    npx dotenvx run -f apps/api/.env.local -- ./scripts/deploy/seed-secrets.sh dev
  ```

- `LIVEKIT_WEBHOOK_SECRET` のように `.env.local` に未登録の値は skip + warn が出る（後で `npx dotenvx set` で追加して再実行）

##### (b) 都度 export

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
# ... 略
./scripts/deploy/seed-secrets.sh dev
```

### 使い方

```bash
# 基本形
./scripts/deploy/seed-secrets.sh <env>

# 推奨: dotenvx 経由
npx dotenvx run -f apps/api/.env.local -- ./scripts/deploy/seed-secrets.sh dev
```

実行イメージ:

```
==> Seeding secrets for /project-template-dev/app
==> External secrets (from environment variables)
  ✓ GOOGLE_CLIENT_ID (from env)
  ✓ GOOGLE_CLIENT_SECRET (from env)
  ✓ LIVEKIT_HOST (from env)
  ✓ LIVEKIT_API_KEY (from env)
  ✓ LIVEKIT_API_SECRET (from env)
  ✓ LIVEKIT_WEBHOOK_SECRET (from env)
  ✓ FRONTEND_URL (from env)
==> Infrastructure-derived secrets (from terraform output)
  ✓ DATABASE_URL (constructed from RDS outputs)
  - REDIS_HOST (skipped, ElastiCache not deployed yet)
==> Updated 8 keys in /project-template-dev/app
```

### destroy / apply サイクルでの典型的な使い方

```bash
cd infra/terraform/aws/env/dev

# 全部消す
terraform destroy

# 再構築 (3〜15 分)
terraform apply

# secret 投入 (10 秒、dotenvx で apps/api/.env.local の値を流す)
cd /Users/.../project-template
npx dotenvx run -f apps/api/.env.local -- ./scripts/deploy/seed-secrets.sh dev
```

これで dev 環境がフル復活する。

### トラブルシュート

| 症状 | 原因 / 対処 |
|---|---|
| `ERROR: 'aws' not installed` | AWS CLI を install (`brew install awscli`) |
| `Credentials could not be loaded` | `aws sts get-caller-identity` が通るか確認。`AWS_PROFILE` の export 漏れ、SSO セッション切れなど |
| `Resource not found in this region` | `AWS_REGION` または `--region` 指定。`ap-northeast-1` が想定 |
| `terraform output -raw rds_address` が失敗 | 対象 env で `terraform init` 後、`terraform apply` 済みか確認 |
| `- GOOGLE_CLIENT_SECRET (skipped, env)` | `apps/api/.env.local` に値が無いか、shell に export していない |
| `Secret name already scheduled for deletion` | 過去の destroy で残骸あり。`recovery_window_in_days = 0` 設定済みの dev では起きないはずだが、起きたら `aws secretsmanager delete-secret --secret-id ... --force-delete-without-recovery` で完全削除 |

### 直接 AWS Console で値を確認したいとき

```bash
aws secretsmanager get-secret-value \
  --secret-id /project-template-dev/app \
  --query SecretString --output text | jq .
```

---

## setup-labels.sh

`.github/labeler.yml`（`actions/labeler@v5` のワークフロー `.github/workflows/labeler.yml` が参照）が付与する PR ラベルを、GitHub リポジトリ側にあらかじめ作成する。

PR の変更パスに応じて以下のラベルが自動付与される:

| 変更パス | ラベル | 色 |
|---|---|---|
| `apps/web/**` | `web` | `#1d76db` |
| `apps/admin/**` | `admin` | `#5319e7` |
| `apps/api/**` | `api` | `#0e8a16` |
| `apps/mobile/**` | `mobile` | `#006b75` |
| `apps/cron/**` | `cron` | `#d93f0b` |
| `apps/worker/**` | `worker` | `#fbca04` |
| `packages/**` | `packages` | `#0052cc` |
| 上記いずれにも該当しない変更のみ | `chore` | `#cfd3d7` |

特徴:
- **idempotent**: `gh label create --force` を使うため、何度実行しても OK（既存ラベルは色/説明を更新）
- **template 向け**: GitHub のラベルは template から生成した新リポジトリに引き継がれないため、派生リポジトリで 1 回実行して揃える

> ラベル自体を事前作成しなくても `actions/labeler` がラベル付与時に自動生成するが、その場合は色がデフォルト（グレー）になる。本スクリプトで作成すると上表の色が付く。

### 前提条件

- `gh` (GitHub CLI) が install 済みで認証済み（`gh auth status` が通る）

### 使い方

```bash
# カレントリポジトリに対して実行
./scripts/setup/setup-labels.sh

# owner/repo を明示指定
./scripts/setup/setup-labels.sh foo/bar
```

実行イメージ:

```
==> Setting up labels on kentakki416/project-template
  ✓ web (#1d76db)
  ✓ admin (#5319e7)
  ✓ api (#0e8a16)
  ✓ mobile (#006b75)
  ✓ cron (#d93f0b)
  ✓ worker (#fbca04)
  ✓ packages (#0052cc)
  ✓ chore (#cfd3d7)
==> Done. 8 labels are in sync on kentakki416/project-template
```
