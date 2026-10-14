# step2-infra-data-warehouse-flag

dev / min / prd の Terraform に `enable_data_warehouse` を足し、`true` の環境にだけ ClickHouse Cloud のサービス、接続情報の secret、ClickHouse の migration 用のタスク定義（`<prefix>-dwh-migration`）を作る。worker の書き込み先（`DATA_WAREHOUSE_TYPE`）もこのフラグで切り替える。CDC は step3。

**既定値（dev / min は `false`、prd は `true`）で dev の plan に ClickHouse のリソースは出ない。** min は worker の `DATA_WAREHOUSE_TYPE` が `clickhouse`（接続先 dummy）から `none` に変わる。prd は apply の workflow が prd を選べない状態（コメントアウト）なので、prd の apply は運用開始時に行う。

設計: [`../README.md`](../README.md#clickhouse-cloud-のサービスterraform) / [secret と環境変数](../README.md#secret-と環境変数)

前提: [step1-clickhouse-migration-command](./step1-clickhouse-migration-command.md)（migration イメージに ClickHouse のコマンドが入っている）

## 対応内容

### `env/{dev,min,prd}/variables.tf`

```hcl
variable "enable_data_warehouse" {
  description = "ClickHouse Cloud のサービスを作り、worker の書き込み先と ClickHouse の migration を有効にするか。CI の apply はフラグの変数を渡さないので、切り替えはこの既定値を変えてコミットする（手順は docs/spec/clickhouse-migration/tasks/step4-ci-deploy-dwh-migration.md）"
  type        = bool
  default     = false # prd は true
}

/**
 * ClickHouse Cloud の API の認証情報。Terraform の apply の workflow が TF_VAR_* で渡す。
 * enable_data_warehouse = false の環境では渡さなくてよい（provider には "unused" を渡す）
 */
variable "clickhouse_org_id" {
  type      = string
  default   = null
  sensitive = true
}
variable "clickhouse_token_key" { ... }
variable "clickhouse_token_secret" { ... }

/** dev / prd だけ。NAT の IP に加えて、分析ツールや手元から繋ぐ送信元を許可する（コンソールで足した IP は次の apply で消えるため） */
variable "clickhouse_additional_ip_access_cidrs" {
  type    = list(string)
  default = []
}
```

### `env/{dev,min,prd}/provider.tf`

```hcl
required_providers {
  ...
  clickhouse = {
    source  = "ClickHouse/clickhouse"
    version = "~> 3.38"
  }
}

/**
 * provider は、ClickHouse のリソースが 0 個でも空でない認証情報を要求する（API は呼ばない）。
 * enable_data_warehouse = false の環境で secret を置かずに plan / apply を通すため、
 * 未設定なら "unused" を渡す。
 */
provider "clickhouse" {
  organization_id = coalesce(var.clickhouse_org_id, "unused")
  token_key       = coalesce(var.clickhouse_token_key, "unused")
  token_secret    = coalesce(var.clickhouse_token_secret, "unused")
}
```

- `coalesce` は null と空文字の両方を飛ばす。GitHub の secret が未設定のとき `TF_VAR_*` は空文字になるが、それも `"unused"` になる
- `.terraform.lock.hcl` を 3 環境とも更新する（`terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`）。CI は `-lockfile=readonly` なので、ハッシュが無いと init で落ちる

### `modules/clickhouse-service`（新規）

| ファイル | 内容 |
| --- | --- |
| `terraform.tf` | `aws` / `random` / `clickhouse`（`ClickHouse/clickhouse ~> 3.38`） |
| `variables.tf` | `name` / `region`（既定 `ap-northeast-1`）/ `ip_access_cidrs` / `database`（既定 `tech_english`）/ `secret_name` / `password_version`（既定 1）/ `credentials_configured`（bool）/ `tags` |
| `main.tf` | 下記 |
| `outputs.tf` | `service_id` / `ecs_secrets`（環境変数名 → valueFrom）/ `secret_arn`（`depends_on` で secret の値の書き込みを待つ。値が入る前に worker や migration のタスク定義が参照しないように）/ `https_host` |

```hcl
resource "random_password" "default_user" {
  length  = 32
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

resource "clickhouse_service" "this" {
  name           = var.name
  cloud_provider = "aws"
  region         = var.region

  /**
   * Basic tier を前提にする。tier は新しい tier の organization では指定してはいけない。
   * メモリは provider が必須にしているので、Basic の固定値（8 GB）に合わせる
   */
  min_replica_memory_gb = 8
  max_replica_memory_gb = 8

  idle_scaling         = true
  idle_timeout_minutes = 15

  ip_access = [for cidr in var.ip_access_cidrs : { source = cidr, description = "${var.name} allowed" }]

  password_wo         = random_password.default_user.result
  password_wo_version = var.password_version

  lifecycle {
    precondition {
      condition     = var.credentials_configured
      error_message = "enable_data_warehouse = true には clickhouse_org_id / clickhouse_token_key / clickhouse_token_secret が要る（GitHub Environment の secret）"
    }
  }
}

/** サービスを作り終えてから作る。サービスの作成に失敗したときに secret だけが残ると、deploy の判定が true になるため */
resource "aws_secretsmanager_secret" "this" {
  name                    = var.secret_name
  recovery_window_in_days = 0
  tags                    = var.tags

  depends_on = [clickhouse_service.this]
}

locals {
  /** worker と migration に渡す接続情報。キーは ecs_secrets の output と共有する */
  connection = {
    DATA_WAREHOUSE_DATABASE = var.database
    DATA_WAREHOUSE_PASSWORD = random_password.default_user.result
    DATA_WAREHOUSE_URL      = "https://${clickhouse_service.this.endpoints.https.host}:${clickhouse_service.this.endpoints.https.port}"
    DATA_WAREHOUSE_USER     = "default"
  }
}

/**
 * app secret と違い ignore_changes を付けない。値はすべて Terraform が作ったリソースから決まるため、
 * サービスを作り直したときに接続先が追随するようにする。
 */
resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode(local.connection)
}
```

- output の `ecs_secrets`（環境変数名 → valueFrom の map）は `keys(local.connection)` から作り、env 側でキーを並べ直さない。`secret_arn` と同じく `depends_on = [aws_secretsmanager_secret_version.this]` を付け、値が入る前にタスク定義が参照しないようにする
- パスワードを変えるときは `terraform apply -replace='module.clickhouse[0].random_password.default_user'` と env 側の `password_version` の +1 を同じ apply で行い、その後 worker を deploy し直す（稼働中の worker は起動時に読んだ古いパスワードを持ち続けるため）
- `recovery_window_in_days = 0` は app secret と同じ（作り直しで名前が衝突しないように）。加えて、deploy workflow はこの secret の有無で ClickHouse の migration を流すか判定する（step4）ため、フラグを `false` にしたら即座に消す必要がある。削除待ちの secret は `describe-secret` で見えてしまう

### `modules/ecs-workload`（変数の追加）

```hcl
variable "additional_secrets" {
  description = "secrets_arn 以外の secret から注入する値。環境変数名 → valueFrom（<secret の ARN>:<キー>::）"
  type        = map(string)
  default     = {}
}
```

`secrets` に `[for k, v in var.additional_secrets : { name = k, valueFrom = v }]` を連結する。`secrets_arn` が null でも `additional_secrets` は効くようにする。既定値は空で、既存の plan に差分は出ない。

### `env/{dev,min,prd}/main.tf`

```hcl
module "clickhouse" {
  source = "../../modules/clickhouse-service"
  count  = var.enable_data_warehouse ? 1 : 0

  name        = local.name_prefix
  region      = var.aws_region
  secret_name = "/${local.name_prefix}/data-warehouse"
  # dev / prd: worker と migration のタスクは NAT から出る
  ip_access_cidrs = concat(["${module.vpc.nat_gateway_public_ip}/32"], var.clickhouse_additional_ip_access_cidrs)
  # min: ["0.0.0.0/0"]（タスクの public IP が毎回変わるため。パスワードで守る）

  # ClickHouse の default ユーザーのパスワードを作り直したら +1 する
  password_version = 1

  credentials_configured = alltrue([
    for v in [var.clickhouse_org_id, var.clickhouse_token_key, var.clickhouse_token_secret] : v != null && v != ""
  ])

  tags = local.common_tags
}

locals {
  /** ClickHouse の接続情報。enable_data_warehouse = false なら空で、worker も migration も受け取らない */
  data_warehouse_secrets = var.enable_data_warehouse ? module.clickhouse[0].ecs_secrets : {}
}
```

- `module "ecs_cluster"` の `secret_arns_readable` に `module.clickhouse[*].secret_arn` を連結する
- `module "ecs_worker"`:
  - `environment = { DATA_WAREHOUSE_TYPE = var.enable_data_warehouse ? "clickhouse" : "none" }`
  - `additional_secrets = local.data_warehouse_secrets`
  - prd / min の `local.secret_keys.worker` から `DATA_WAREHOUSE_*` を外す（dev はもともと持っていない）
  - dev の「ClickHouse をホスティングしない環境なので」のコメントを、フラグで切り替える旨に直す
- prd / min の `module.app_secrets` の `initial_values` から dummy の `DATA_WAREHOUSE_*` と、その説明コメントを消す
- dwh-migration のタスク定義を足す:

```hcl
/**
 * ClickHouse の migration（one-shot。Service なし）
 * enable_data_warehouse のときだけ作る（deploy workflow が流すかどうかは接続情報の secret の有無で判定する）。
 * イメージは Drizzle の migration と同じで、command で ClickHouse のコマンドを起動する。
 */
module "ecs_dwh_migration" {
  source = "../../modules/ecs-workload"
  count  = var.enable_data_warehouse ? 1 : 0

  name    = "${local.name_prefix}-dwh-migration"
  image   = "${data.aws_ecr_repository.migration.repository_url}:latest"
  cpu     = 256
  memory  = 512
  command = ["pnpm", "--filter", "@repo/data-warehouse", "dwh:migrate:run"]

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  environment = {
    /** step3 で var.enable_cdc に応じて clickpipes にする */
    DATA_WAREHOUSE_CDC = "none"
    /** logger を JSON 出力にする（未設定だと development 扱いで色付きのテキストになる） */
    NODE_ENV = "production"
  }
  additional_secrets = local.data_warehouse_secrets

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}
```

- min も dev / prd と同じく `:latest`（既存の `ecs_migration` と同じ）
- `outputs.tf` に `clickhouse_https_host`（`one(module.clickhouse[*].https_host)`）と `ecs_dwh_migration_task_definition_family`（`one(module.ecs_dwh_migration[*].task_definition_family)`）を足す

### Terraform の workflow

`terraform-aws-env-apply.yml` と `terraform-aws-env-ci.yml` の plan の step に足す（apply の step には要らない。保存した plan に変数の値が入っているため）:

```yaml
env:
  TF_VAR_clickhouse_org_id: ${{ secrets.CLICKHOUSE_ORG_ID }}
  TF_VAR_clickhouse_token_key: ${{ secrets.CLICKHOUSE_TOKEN_KEY }}
  TF_VAR_clickhouse_token_secret: ${{ secrets.CLICKHOUSE_TOKEN_SECRET }}
```

- secret は GitHub Environment（`dev` / `min-terraform` / `prd`）ごとに置く。**フラグを `true` にする環境にだけ置けばよい**。`true` から `false` に戻すときは、その apply が終わるまで消さない（サービスの削除と、その PR の CI の plan で API を呼ぶため）
- CI も dev / min を plan するので同じ env が要る（ClickHouse のリソースの refresh に API を呼ぶため）

### ClickHouse Cloud の準備（Terraform の管理外）

1. ClickHouse Cloud の organization を作る（Basic tier）。dev / min / prd はそれぞれ別の organization にする（API キーが organization 全体の Admin 権限で、dev の API キーは PR の CI にも渡るため）
2. organization の API キーを作る（権限: Admin。サービスと ClickPipe を作るため）
3. GitHub Environment の secret に `CLICKHOUSE_ORG_ID` / `CLICKHOUSE_TOKEN_KEY` / `CLICKHOUSE_TOKEN_SECRET` を登録する

手順は `docs/setup/infra.md` に足す。

### ドキュメント

| ファイル | 変更 |
| --- | --- |
| `packages/data-warehouse/clickhouse/README.md` | 「ホスティング」の表を「`enable_data_warehouse` で選ぶ（既定 dev / min は false、prd は true）」に直す。「dev は ClickHouse をホスティングしない」の段落を、フラグで作る・作らないを選べる旨に直す |
| `packages/data-warehouse/README.md` | 「実装の選び方」の使う環境を、`enable_data_warehouse` で決まる旨に直す |
| `packages/data-warehouse/src/noop-data-warehouse.ts` | コメントの「ローカルの一部・dev 等」を「`enable_data_warehouse = false` の環境」に直す |
| `apps/worker/src/env.ts` / `apps/worker/src/index.ts` / `apps/worker/CLAUDE.md` | `DATA_WAREHOUSE_TYPE` のコメントの「dev 等」を同様に直す |
| `docs/setup/infra.md` | ClickHouse Cloud の準備と、`enable_data_warehouse` の切り替え手順へのリンク |
| `infra/README.md` | module の一覧に `clickhouse-service` を、dev / prd の差分表に `enable_data_warehouse` の既定値を足す |
| `docs/spec/minimal-deploy/README.md` | 「ClickHouse Cloud は prd と同じ扱い・同じ接続先」を、`enable_data_warehouse` で選ぶ旨に直す |

## 動作確認

### plan（フラグが既定値のまま）

- dev: ClickHouse のリソースは出ない。差分は `ecs-workload` の変更による task definition の差分が出ないこと（`additional_secrets` が空なら secrets は同じ）を確認する
- min: worker の task definition が `DATA_WAREHOUSE_TYPE=none` になり、`DATA_WAREHOUSE_*` の secrets が消える。dwh-migration は作られない
- GitHub の secret（`CLICKHOUSE_*`）が未設定のまま plan / apply が通る

### dev で `enable_data_warehouse = true`（一時的に。確認後に戻すか、そのまま運用するかは決める）

- apply で `clickhouse_service`、`/tech-english-dev/data-warehouse`、`tech-english-dev-dwh-migration` ができる
- ClickHouse Cloud のコンソールでサービスが Basic tier・アイドル 15 分で作られている
- deploy workflow はまだ変えていないので、dwh-migration を手で起動して確認する
  - Terraform が作るタスク定義の image は `:latest` の placeholder で、ECR には SHA タグのイメージしか無い（deploy が SHA タグで register し直す前提）。そのため、Drizzle の migration のタスク定義の最新 revision の image（step1 のマージ後に dev の deploy を 1 回流しておく）に差し替えて register してから起動する

```bash
IMAGE=$(aws ecs describe-task-definition --task-definition tech-english-dev-migration \
  --query 'taskDefinition.containerDefinitions[0].image' --output text)
aws ecs describe-task-definition --task-definition tech-english-dev-dwh-migration --query taskDefinition \
  | jq --arg IMAGE "$IMAGE" '.containerDefinitions[0].image = $IMAGE
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' \
  > /tmp/dwh.json
REVISION_ARN=$(aws ecs register-task-definition --cli-input-json file:///tmp/dwh.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
aws ecs run-task --cluster tech-english-dev-cluster --task-definition "$REVISION_ARN" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private subnet>],securityGroups=[<ecs sg>],assignPublicIp=DISABLED}"
```

  - ログに `events` の作成と「CDC が無いので view を作らない」旨が出て、終了コード 0
- 認証情報の secret を外して plan すると、`precondition` のエラーになる
