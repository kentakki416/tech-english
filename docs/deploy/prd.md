# 本番 (prd) デプロイ手順書

このテンプレートから派生したプロジェクトを AWS (バックエンド) + Vercel (フロント) に
**ゼロから本番デプロイ**するための手順書。**順番と落とし穴**を中心にまとめる。

> 📌 **表記**: 本書の `<project>` はプロジェクト名（テンプレ既定は `project-template`、`var.project_name`）、
> `<your-domain>` は購入する本番ドメイン（例 `example.com`）に読み替える。`<owner>` は GitHub org/user。

> ⚠️ **最重要の教訓**: ALB は **最初から HTTPS の最終形にしてから app を deploy する**こと。
> HTTP で deploy → 後から HTTPS 化、の順だと **ECS Blue/Green のリスナールール紐付けが壊れ**、
> ECS サービスの作り直しが必要になる（[落とし穴 7](#落とし穴-7-https-は-deploy-より先に-ecs-bluegreen-のルール紐付け)）。

## 目次

- [全体像と順番](#全体像と順番)
- [前提（事前に用意するもの）](#前提事前に用意するもの)
- [Phase 1: Terraform backend (bootstrap)](#phase-1-terraform-backend-bootstrap)
- [Phase 2: account レイヤ（OIDC / IAM ロール / ECR）](#phase-2-account-レイヤoidc--iam-ロール--ecr)
- [Phase 3: GitHub Environments の設定](#phase-3-github-environments-の設定)
- [Phase 4: ドメイン購入（Route53 Domains）](#phase-4-ドメイン購入route53-domains)
- [Phase 5: GitHub OAuth App（本番用）](#phase-5-github-oauth-app本番用)
- [Phase 6: env/prd を apply（HTTPS 込みの最終形で）](#phase-6-envprd-を-applyhttps-込みの最終形で)
- [Phase 7: secret 投入（seed-secrets.sh）](#phase-7-secret-投入seed-secretssh)
- [Phase 8: アプリのデプロイ（GitHub Actions）](#phase-8-アプリのデプロイgithub-actions)
- [Phase 9: Vercel（フロント）](#phase-9-vercelフロント)
- [Phase 10: セキュリティ仕上げ & 動作確認](#phase-10-セキュリティ仕上げ--動作確認)
- [落とし穴集](#落とし穴集)

---

## 全体像と順番

```mermaid
flowchart TD
    A[Phase 1: bootstrap<br/>S3 backend] --> B[Phase 2: account<br/>ローカル apply<br/>OIDC/IAM/ECR]
    B --> C[Phase 3: GitHub Environments<br/>AWS_ROLE_ARN を環境別に設定]
    C --> D[Phase 4: ドメイン購入<br/>Route53 Domains]
    D --> E[Phase 5: 本番 OAuth App<br/>callback=本番ドメイン]
    E --> F[Phase 6: env/prd apply<br/>★domain_name 設定済みの最終形で]
    F --> G[Phase 7: seed-secrets.sh<br/>DB/Redis/PAT/OAuth/FRONTEND_URL]
    G --> H[Phase 8: Deploy to AWS prd<br/>build/migrate/deploy + 承認]
    H --> I[Phase 9: Vercel<br/>フロント = apex]
    I --> J[Phase 10: 仕上げ + 動作確認]
```

**鉄則**:
- account レイヤの apply は **ローカルから**（CI が assume する OIDC ロール自己書き換えのため）。
- env/prd は **domain_name を設定した HTTPS の最終形で apply してから** app を deploy する。
- secret は env/prd apply（RDS/Redis 作成）の **後** に seed する。

---

## 前提（事前に用意するもの）

- AWS CLI が本番アカウントで認証済み（`aws sts get-caller-identity` で確認）。account/bootstrap の初回 apply にはリソース作成権限（≒admin）が必要
- Terraform 1.10+ / AWS CLI / jq / gh CLI / Docker
- GitHub リポジトリ（`<owner>/<project>`）への admin 権限
- 本番ドメインの方針（例: フロント `<your-domain>`(apex) / API `api.<your-domain>`）
- 外部連携の token（例: crawler 用の `GITHUB_PAT` など、アプリが使うもの）— dev のものを流用可なら流用

---

## Phase 1: Terraform backend (bootstrap)

S3 state バケットを作る。一度きり・ローカル apply。

```bash
cd infra/terraform/aws/bootstrap
terraform init && terraform apply
```

> state lock は S3 ネイティブ（`use_lockfile=true`、Terraform 1.10+）。

---

## Phase 2: account レイヤ（OIDC / IAM ロール / ECR）

**初回はローカルから apply**（CI が assume する OIDC ロール自身を作るため）。

```bash
cd infra/terraform/aws/account
terraform init && terraform apply
# 作成物: GitHub OIDC provider / IAM role(dev, prd) / ECR(api, worker, migration, cron)
terraform output -raw github_actions_dev_role_arn   # ← 控える
terraform output -raw github_actions_prd_role_arn   # ← 控える
```

> ⚠️ **prd ロールにも `AdministratorAccess` が必要**（[落とし穴 2](#落とし穴-2-prd-ロールに-tfstate--リソース権限が無い-s3-403)）。
> `account/github_oidc.tf` の `github_actions_admin_prd` attachment が入っていることを確認。

---

## Phase 3: GitHub Environments の設定

GitHub → Settings → Environments で **3 つ**作成し、**環境ごとに正しいロール ARN** を `AWS_ROLE_ARN`（Environment secret）に設定する。

| Environment | `AWS_ROLE_ARN` |
|---|---|
| `dev` | dev ロール ARN（末尾 `-github-actions-dev`） |
| `prd` | prd ロール ARN（末尾 `-github-actions-prd`） |
| `prd-api-approval` | prd ロール ARN（同上。prd の trust policy が両 sub を許可） |

```bash
gh secret set AWS_ROLE_ARN --env dev  --repo <owner>/<project> --body "<dev ロール ARN>"
gh secret set AWS_ROLE_ARN --env prd  --repo <owner>/<project> --body "<prd ロール ARN>"
gh secret set AWS_ROLE_ARN --env prd-api-approval --repo <owner>/<project> --body "<prd ロール ARN>"
```

- ⚠️ **repo レベルの `AWS_ROLE_ARN` は作らない／消す**（dev/prd で別ロールが必要なため、必ず Environment secret）。
- ⚠️ **テンプレ由来の取り違えに注意**（[落とし穴 1](#落とし穴-1-github-environment-の-aws_role_arn-が別プロジェクトのロールを指す)）。派生直後は `project-template` のロール ARN が残っていることがある。
- **承認ゲート**:
  - `prd-api-approval` に **Required reviewers** を設定（api 本番切替の承認用）。
  - `prd` 環境は **Required reviewers を付けない**（付けると build/migrate/Plan 全部が毎回承認待ちになる。承認は api 切替だけにする設計）。

---

## Phase 4: ドメイン購入（Route53 Domains）

AWS コンソール → **Route 53 → Domains → Register domains** で購入。

1. ドメイン（例 `<your-domain>`）を検索 → 購入（.com は約 $15/年）
2. 登録者連絡先を入力、**Privacy protection 有効**、**Auto-renew 有効**
3. 規約同意 → 購入

購入後の確認（数分〜数十分で `SUCCESSFUL`）:

```bash
aws route53domains list-operations --region us-east-1 \
  --query 'Operations[?DomainName==`<your-domain>`].{type:Type,status:Status}'
dig +short NS <your-domain>   # NS が awsdns で返れば DNS 委譲が有効
```

> Route 53 Domains で買うと **hosted zone が自動作成**され、NS も自動でそこを向く（手動設定不要）。
> terraform の `data "aws_route53_zone"` がこれを lookup する。**NS 公開伝播後に ACM の DNS 検証が通る**。

---

## Phase 5: GitHub OAuth App（本番用）

アプリが GitHub 認証を使う場合、**dev とは別の OAuth App を作る**（callback URL が違うため必須・1 App = 1 callback）。

GitHub → Settings → Developers → OAuth Apps → New OAuth App
- Homepage URL: `https://<your-domain>`
- Authorization callback URL: `https://<your-domain>/api/auth/callback/github`
- → **Client ID** と **Client secret** を控える（Phase 7 で seed）

---

## Phase 6: env/prd を apply（HTTPS 込みの最終形で）

> ★ **ここが最重要**。HTTP で先に立ち上げてから後で HTTPS 化、をやると ECS Blue/Green の
> ルール紐付けが壊れる（[落とし穴 7](#落とし穴-7-https-は-deploy-より先に-ecs-bluegreen-のルール紐付け)）。
> **最初から `domain_name` を設定して HTTPS の最終形で apply** し、それから Phase 8 で deploy する。

1. `env/prd/variables.tf` の `domain_name` を本番ドメインに設定（default を `"<your-domain>"` に）。
   - API は `api.<your-domain>`（`subdomain=""` なので apex 直下のサブドメイン）。stg/dev を足すなら `subdomain="stg"` 等。
2. `env/prd/.trivyignore` の `AVD-AWS-0054`（HTTPS 未使用）行を削除。
3. apply（CI = `terraform-aws-env-apply` を `environment=prd` で workflow_dispatch、またはローカル）:

```bash
# CI: Actions → terraform-aws-env-apply → environment=prd
# or local:
cd infra/terraform/aws/env/prd && terraform init && terraform apply
```

作成物: VPC / RDS(Multi-AZ) / ElastiCache(TLS) / ALB(HTTPS+Blue/Green) /
ECS cluster + api/worker/migration/cron / EventBridge スケジュール / Secrets(箱+JWT) /
**ACM 証明書 `*.<your-domain>`（DNS 検証）+ HTTPS リスナー + `api.<your-domain>` の ALIAS Aレコード**。

> ⚠️ この時点で ECS api/worker は **イメージ未 push のため起動失敗**する（後で deploy して正常化）。想定どおり。

---

## Phase 7: secret 投入（seed-secrets.sh）

RDS/Redis ができた**後**に接続情報 + 外部 secret を投入する（これが無いと ECS タスクは起動に失敗する）。

```bash
cd <repo-root>
# アプリが使う外部 secret を export（プロジェクトに合わせて増減）:
export GITHUB_CLIENT_ID='<本番 OAuth App の Client ID>'
export GITHUB_CLIENT_SECRET='<本番 OAuth App の Client secret>'
export FRONTEND_URL='https://<your-domain>'           # フロント(apex)
# 例: crawler 等を使うなら export GITHUB_PAT='ghp_...'（dev のを流用可）
./scripts/deploy/seed-secrets.sh prd
```

- 自動構築される（export 不要）: `DATABASE_URL` / `REDIS_HOST` / `REDIS_URL`(prd は `rediss://` = TLS)
  - ⚠️ `DATABASE_URL` は **`?sslmode=no-verify`** で構築する（`require` だと pg が TLS で落ちる。[落とし穴 9](#落とし穴-9-db-の-tls-が-pg-で-verify-full-扱いになり-rds-で落ちる)）
- スクリプトは **merge 方式**（何度でも再実行可。値だけ上書き）
- 確認:

```bash
aws secretsmanager get-secret-value --secret-id /<project>-prd/app \
  --query SecretString --output text | jq 'keys'
# DATABASE_URL / REDIS_* / OAuth / FRONTEND_URL / JWT_* が揃っていること
```

> api は OAuth 系の値が**非空**でないと起動に失敗する設計。`FRONTEND_URL` は有効な URL が必須。
> どの key が必須かは `apps/api/src/env.ts`（Zod スキーマ）を参照。

---

## Phase 8: アプリのデプロイ（GitHub Actions）

Actions → **「Deploy to AWS prd」** を workflow_dispatch。

フロー（`prd` ゲートを外していれば自動で流れる）:
1. **build**: api / worker / cron / **migration** の4イメージを ECR へ push
2. **migrate**: prod RDS に `drizzle-kit migrate`（migration イメージ = `packages/db/Dockerfile.migration`）
3. **deploy-worker / deploy-cron**: 承認なしで完走
4. **deploy-api**: Blue/Green の green を待機 TG に投入 → テストトラフィックを green に
5. **`prd-api-approval` で承認待ち** ← ここで承認

**承認前に green を実機確認できる**（Blue/Green の利点）:
```bash
# テストリスナー(9000)で green を叩く（test_listener_allowed_cidrs が許可していれば）
curl http://<ALB_DNS>:9000/api/health
```
green が 200 を返すのを確認 → Actions の「Review pending deployments」で **`prd-api-approval` を Approve**
→ SSM=approved → **本番トラフィックが green に切替** + bake → 完了。

### マスタデータ（seed）の扱い

本番のマスタデータ（マスタテーブルの初期行など）は **seed スクリプトではなく migration で管理**する（`packages/db/drizzle/migrations/*_seed_xxx/migration.sql` に `INSERT ... ON CONFLICT DO NOTHING` を置く）。これにより上記 **migrate ステップで自動・冪等・バージョン管理**され、別ステップが不要になる。

- `packages/db/drizzle/seed.ts` は **dev 専用データ**（dev users / fixtures）のみを扱い、`NODE_ENV=production` では何もしない
- 新しいマスタを足すときは migration を 1 本追加する（`pnpm --filter @repo/db db:generate --custom --name=seed_xxx` で空の `migration.sql` を作り、冪等 INSERT を記述）

---

## Phase 9: Vercel（フロント）

`apps/web`（Next.js）を Vercel(Pro) にデプロイし、apex `<your-domain>` に接続する。

### 9-1. プロジェクト作成 & ビルド設定（モノレポ）

Vercel → Add New → Project → リポジトリを import し、以下を設定:

| 項目 | 値 |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js（自動検出） |
| Install Command | デフォルト（`pnpm install`） |
| **Build Command（上書き）** | `cd ../.. && pnpm --filter @repo/api-schema build && pnpm --filter web exec next build` |

> ⚠️ **dotenvx の罠**: web の `build` スクリプトが `dotenvx run -f .env.local -- next build` 形式の場合、`.env.local` は gitignore で Vercel に無いため**そのままだとビルドが落ちる**。さらに `next build` は依存パッケージ（`@repo/*`）を自前でビルドしない。
> → Build Command を上書きして **dotenvx を回避しつつ依存パッケージを先にビルド**する（依存は web の `package.json` に合わせて調整）。

### 9-2. 環境変数（Production スコープ）

web の `src/env.ts`（Zod スキーマ）が要求する値を Vercel に設定する。典型例:

| Key | Value | 備考 |
|---|---|---|
| `API_URL` | `https://api.<your-domain>` | サーバ側から API を叩く origin |
| `GITHUB_CLIENT_ID` | 本番 OAuth App の Client ID | API に seed したものと同一 |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | **ビルド時に焼き込まれる**ので初回デプロイ前に必須 |

> `NEXT_PUBLIC_*` はビルド時に焼き込まれる／それ以外はランタイム読み込み。`GITHUB_CLIENT_SECRET` は通常 web 側に不要（OAuth コード交換は API 側）。`NODE_ENV=production` は Vercel が自動付与。

### 9-3. カスタムドメイン（apex）と DNS レコード

Vercel → Settings → Domains に `<your-domain>`（+ 任意で `www.<your-domain>`）を追加。
Vercel が「Set the following record」で要求する DNS を **Route53 hosted zone に追加**する:

| 名前 | type | 値 |
|---|---|---|
| `<your-domain>`（apex） | **A** | `76.76.21.21` |
| `www.<your-domain>` | **CNAME** | `cname.vercel-dns.com` |

```bash
ZID=$(aws route53 list-hosted-zones-by-name --dns-name <your-domain> \
  --query 'HostedZones[0].Id' --output text | sed 's|/hostedzone/||')
aws route53 change-resource-record-sets --hosted-zone-id "$ZID" --change-batch '{
  "Changes": [
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"<your-domain>.","Type":"A","TTL":300,"ResourceRecords":[{"Value":"76.76.21.21"}]}},
    {"Action":"UPSERT","ResourceRecordSet":{"Name":"www.<your-domain>.","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"cname.vercel-dns.com"}]}}
  ]
}'
```

> ⚠️ **「Invalid Configuration」が出る**のは、この DNS レコードを **Route53 にまだ入れていない**だけ（ドメイン追加と DNS 設定は別作業）。上記を入れて伝播すると Vercel が自動で「Valid Configuration」になり、**apex の TLS は Vercel が自動発行**する（ACM の `*.<your-domain>` は apex を含まないが、apex は Vercel 側が担当）。
> `api.<your-domain>`(ALB ALIAS) とは別レコードなので競合しない。Vercel 画面の表示値が上記と違う場合は表示値を優先。

### 9-4. FRONTEND_URL の整合

本番 URL が確定したら `FRONTEND_URL=https://<your-domain>` で `seed-secrets.sh prd` を再実行 → 必要なら api を再デプロイ。

---

## Phase 10: セキュリティ仕上げ & 動作確認

- `env/prd/variables.tf` の `test_listener_allowed_cidrs`（Blue/Green テスト用 9000 番）を `0.0.0.0/0` → 社内/オフィス固定 IP に絞って再 apply
- 動作確認:
  - `https://api.<your-domain>/api/health` → 200
  - `https://<your-domain>` 表示 → 認証 → 主要フロー
  - cron: 手動 `aws ecs run-task --task-definition <project>-prd-cron`、EventBridge スケジュールが ENABLED

---

## 落とし穴集

> 派生プロジェクト（このテンプレート由来）で実際に踏んだもの。新規プロジェクト立ち上げ時のチェックリストとして使う。

### 落とし穴 1: GitHub Environment の `AWS_ROLE_ARN` が別プロジェクトのロールを指す
派生直後は GitHub の Environment secret がテンプレ元（`project-template-github-actions-dev` 等）の ARN を引き継いでいることがある。そのロールはこのアカウントに存在せず、CI が `Not authorized to perform sts:AssumeRoleWithWebIdentity` で落ちる。
→ **各環境の `AWS_ROLE_ARN` を `<project>-github-actions-{dev,prd}` に設定し直す**。CloudTrail の `AssumeRoleWithWebIdentity`（`errorCode=AccessDenied`）で、どのロールを assume しようとしたか分かる。

### 落とし穴 2: prd ロールに tfstate / リソース権限が無い (S3 403)
dev ロールは `AdministratorAccess` 付きだが、prd ロールを scoped policy のみにすると、CI の `Terraform Plan (prd)` が `tfstate` 読込で 403 になる。terraform は IAM ロールまで作るため scoped 化は事実上 admin 相当。
→ **prd ロールにも `AdministratorAccess` を attach**（`account/github_oidc.tf` の `github_actions_admin_prd`）。

### 落とし穴 3: RDS の engine_version をマイナーでピン留めすると create で落ちる
`engine_version = "16.6"` のようにマイナー固定すると、AWS が EOL で廃止したとき `InvalidParameterCombination: Cannot find version 16.6` で apply が落ちる（validate/plan は通る）。
→ **メジャー指定 `"16"` + `auto_minor_version_upgrade=true`**。

### 落とし穴 4: SG rule の description は ASCII のみ
`aws_security_group_rule` の `description` に日本語を入れると apply で `doesn't comply with restrictions` で落ちる（validate/plan は通る）。
→ description は英語(ASCII)。意図は隣の `#` コメントに書く。

### 落とし穴 5: Dockerfile の build は `turbo run build` を使う
`pnpm --filter <app> build` は app の `tsc` を直接実行し turbo を経由しないため、依存 `@repo/*` が未ビルドで `TS2307: Cannot find module '@repo/db'` になる（ローカルは既ビルド済みで再現しない／Docker で初めて出る）。
→ `RUN npx turbo run build --filter=<app>`（turbo.json の `dependsOn: ["^build", ...]` で依存を先にビルド）。

### 落とし穴 6: migration Dockerfile は packages/db に置く（欠落しやすい）
DB の schema / migrations は `@repo/db`（packages/db）にあるのに、migration の Dockerfile が `apps/api/Dockerfile.migration`（旧構成の名残）を参照していると、ファイル欠落で build が `failed to read dockerfile` で落ちる。
→ **`packages/db/Dockerfile.migration`** を使い、workflow の `-f` パスもそこに向ける。`CMD = pnpm --filter @repo/db db:migrate`（`drizzle-kit migrate`）。
→ **migration は単一スキーマ(@repo/db)を migrate するので、api/cron/worker いずれが触るテーブルも一括で反映される**（DB は1つ・スキーマは1つの共有設計）。

### 落とし穴 7: HTTPS は deploy より先に（ECS Blue/Green のルール紐付け）
**最大の落とし穴。** HTTP で先に deploy → 後から `domain_name` を設定して HTTPS 化、の順だと:
1. HTTP→HTTPS の apply で ALB リスナールールが**作り直され ARN が変わる**
2. ところが ECS サービスは**旧 HTTP ルールを参照したまま**（ECS ネイティブ Blue/Green は `production_listener_rule` を **in-place 変更できない**＝ update-service では効かない）
3. 以後の Blue/Green デプロイは「存在しない旧ルール」を操作し、新 HTTPS ルールは誰も直さず **503**

**回避**: [Phase 6](#phase-6-envprd-を-applyhttps-込みの最終形で) のとおり **最初から HTTPS の最終形で apply してから deploy** する。

**既に踏んでしまった場合の復旧**（ECS サービスを作り直して HTTPS ルールにバインドし直す）:
```bash
cd infra/terraform/aws/env/prd
terraform apply -replace="module.ecs_api.aws_ecs_service.this[0]"
# 数十秒のダウンあり（pre-launch なら許容）。新サービスが HTTPS ルールにバインドされ 200 に復旧
```
> ALB モジュールの production rule は `lifecycle { ignore_changes = [action] }`（重みは ECS/手動管理）。
> 一時しのぎなら `aws elbv2 modify-rule` で健全な TG へ重み 100 にする手もあるが、ECS は旧ルール参照のままなので**将来のデプロイがまた壊れる**。根本解決はサービス再作成。

### 落とし穴 8: 承認ゲートの二重化
`prd` 環境に Required reviewers を付けると、build/migrate/deploy/Plan すべてが毎回承認待ちになり、キャンセルした run も `reject-api`(environment=prd) で詰まってデッドロックする。
→ **`prd` 環境のゲートは外し、承認は `prd-api-approval`（api 本番切替）だけ**にする。

### 落とし穴 9: DB の TLS が pg で verify-full 扱いになり RDS で落ちる
`createDrizzleClient` / `drizzle-kit migrate`（と併存している `createPrismaClient` の `@prisma/adapter-pg`）は、いずれも node-postgres（`pg`）で接続する。
DATABASE_URL が **`?sslmode=require`** だと、pg（pg-connection-string）が
これを **`verify-full` 扱い**にし、RDS の CA（公的 CA ではない自己署名チェーン）を弾いて
`self-signed certificate in certificate chain` で落ちる。

ハマりどころ:
- Prisma で migration していた頃は、migration だけ Rust 製エンジンで `require` を libpq 流（暗号化のみ・CA 検証なし）に解釈して通り、ランタイム / seed だけが落ちていた。Drizzle は migration も pg で接続するので、migrate ステップで先に落ちる。
- api の shallow な `/health`（`{"status":"ok"}`）は DB を見ないので、**DB アクセスが壊れていても 200 を返してしまう**（気づきにくい）。

→ **`DATABASE_URL` を `?sslmode=no-verify`** にする（暗号化はするが CA 検証しない。RDS は VPC 内通信なので実用上のリスクは低い）。`seed-secrets.sh` がこの値で構築する。
secret を直して **api/worker を再デプロイ**（ECS は secret をタスク起動時に注入するため、既存タスクは再起動するまで旧 URL のまま）。
より厳格にするなら RDS CA を同梱して `verify-full` にする（`createDrizzleClient` の Pool に `ssl.ca` を渡す改修が必要・将来の hardening）。
