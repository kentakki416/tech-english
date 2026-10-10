# step3-infra-env-min

minimal 環境の Terraform を作る。`infra/terraform/aws/env/min/` を新設し、Lambda / API Gateway 用の module を追加する。worker（ECS Fargate Spot）を作るかどうかは `enable_worker` で切り替える。既存の `ecs-cluster` / `ecs-workload` には Fargate Spot を使うための変数を足し、`account/` には GitHub Actions 用の IAM role を足す。**`env/prd` / `env/dev` と既存の module の挙動には手を入れない**（足す変数の既定値は現在の挙動）。

設計: [`../README.md`](../README.md#iac-の構成)

前提: [step1-api-event-flush-and-lwa](./step1-api-event-flush-and-lwa.md)（LWA 入りの api イメージが必要）/ [step2-api-event-tracker-type](./step2-api-event-tracker-type.md)（worker を作らないときに `EVENT_TRACKER_TYPE=none` を使う）

## 対応内容

### PlanetScale（Terraform の管理外）

コンソールで作る。Terraform では管理しない（AWS の外のサービスのため）。

1. Postgres のデータベースを作る。リージョン `AWS ap-northeast-1 (Tokyo)`、クラスター `PS-5`（単一ノード）
2. アプリ用のロールを作り、内蔵 PgBouncer（port 6432）経由の接続文字列を控える（`postgresql://<user>:<password>@<host>:6432/<db>?sslmode=verify-full`。PgBouncer 経由にする理由は [DB（PlanetScale Postgres）](../README.md#dbplanetscale-postgres)）
3. `packages/db` の Pool と同じ startup parameter を付けて接続できるか確認する（[リスク](../README.md#リスクと実装時の確認事項)の確認）

    ```bash
    PGOPTIONS='-c TimeZone=UTC' psql '<2 で控えた接続文字列>' -c 'SHOW TimeZone;'
    ```

    `unsupported startup parameter: options` で拒否されず、`UTC` が返れば OK
4. 自動バックアップの保持期間を確認し、`../README.md` の「DB（PlanetScale Postgres）」に追記する

### Upstash Redis（Terraform の管理外）

refresh token と、worker を作る場合は BullMQ の保存先。PlanetScale と同じくコンソールで作る（Upstash を使う理由は [Redis（Upstash）](../README.md#redisupstash)）。

1. Redis のデータベースを作る。リージョン `AWS ap-northeast-1 (Tokyo)`、read region は付けない
2. プランを選ぶ。worker を作らない（`enable_worker = false`）なら `Pay as You Go`、作るなら `Fixed`（最小の 250MB、$10/月）。BullMQ はジョブが無くても Redis に定期的にアクセスするため、Pay as You Go ではコマンド課金が積み上がる（Upstash の推奨）。プランは後からコンソールで切り替えられる
3. Eviction が無効になっていることを確認する。有効だと、容量の上限に近づいたときに期限前の refresh token や未処理のジョブが消される（BullMQ も eviction しない設定が前提）
4. `Pay as You Go` の場合は月の予算（Budget）を設定する。予算に達すると Upstash が rate limit をかけ、ログインと refresh が失敗するため、想定の使用量より十分大きくする（目安は [Redis（Upstash）](../README.md#redisupstash)）
5. TLS 付きの接続文字列（`rediss://default:<password>@<endpoint>:6379`）を控える
6. 接続できるか確認する

    ```bash
    redis-cli --tls -u '<5 で控えた接続文字列>' PING
    ```

    `PONG` が返れば OK

### `account/`

**GitHub Actions 用 role**（`github_oidc.tf`）: min は **deploy 用と Terraform 用で role を分ける。** deploy workflow はアプリのコードを build し、外部の action も動かすため、侵害されたときに AWS アカウント全体を変更できないよう、必要な権限だけを持たせる。Terraform 用は dev / prd と同じく `AdministratorAccess`（既存の TODO の対象）だが、別の GitHub Environment からしか assume できないようにする。

| role | trust policy（OIDC の sub） | attach する policy | 使う workflow |
| --- | --- | --- | --- |
| `github_actions_min` | `repo:<owner>/<repo>:environment:min` | `ecr_push`（既存）/ `ecs_deploy`（既存）/ `deploy_min`（新規） | `deploy-aws-min.yml` |
| `github_actions_min_terraform` | `repo:<owner>/<repo>:environment:min-terraform` | `AdministratorAccess` | `terraform-aws-env-ci.yml` / `terraform-aws-env-apply.yml`（min のとき） |

`deploy_min` は Lambda のデプロイ、secret の読み取り、migration を起動するためのネットワークの解決（VPC / subnet / security group の参照。EC2 の Describe 系は resource を絞れないので `*`）を許可する。

```hcl
data "aws_iam_policy_document" "deploy_min" {
  statement {
    sid    = "DeployLambdaFunctions"
    effect = "Allow"
    actions = [
      "lambda:GetAlias",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:ListVersionsByFunction",
      "lambda:PublishVersion",
      "lambda:UpdateAlias",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
    ]
    resources = ["arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-min-*"]
  }

  statement {
    sid       = "ReadAppSecret"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:*:${data.aws_caller_identity.current.account_id}:secret:/${var.project_name}-min/app-*"]
  }

  statement {
    sid    = "ResolveNetwork"
    effect = "Allow"
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeVpcs",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "deploy_min" {
  name        = "${var.project_name}-deploy-min"
  description = "Policy for deploy-aws-min.yml (Lambda deploy, app secret read, network resolution)"
  policy      = data.aws_iam_policy_document.deploy_min.json
}
```

`outputs.tf` に `github_actions_min_role_arn` と `github_actions_min_terraform_role_arn` を足す。初回はローカルから apply し、GitHub の Environment `min` と `min-terraform` の Secrets にそれぞれの ARN を `AWS_ROLE_ARN` として登録する（`infra/terraform/CLAUDE.md`「account の初回 apply はローカルから実行」と同じ手順）。

Terraform の workflow は、対象の env が `min` のときだけ GitHub Environment を `min-terraform` に読み替える（`terraform-aws-env-ci.yml` の plan job と `terraform-aws-env-apply.yml`）。

**ECR の repository policy**（`ecr.tf`）: api の repository に、Lambda サービスからの pull を許可する。Lambda は関数の作成時に自分で repository policy を書き足すが、IaC の外で policy が変わるのを避けるため明示しておく。

```hcl
data "aws_iam_policy_document" "api_lambda_pull" {
  statement {
    sid     = "AllowLambdaPull"
    effect  = "Allow"
    actions = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "aws:sourceArn"
      values   = ["arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-*"]
    }
  }
}

resource "aws_ecr_repository_policy" "api_lambda_pull" {
  repository = aws_ecr_repository.api.name
  policy     = data.aws_iam_policy_document.api_lambda_pull.json
}
```


### `modules/lambda-function`（新規）

コンテナイメージの Lambda 関数、alias `live`、ロググループ、実行ロールを作る。同時実行数の上限（予約）も変数で指定できる。**`image_uri` / `environment` / alias の `function_version` は deploy workflow が更新するので `ignore_changes` にする。**

```hcl
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_in_days

  tags = var.tags
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  package_type  = "Image"
  image_uri     = var.image_uri
  role          = aws_iam_role.lambda.arn
  architectures = ["x86_64"] # GitHub Actions が linux/amd64 で build するため
  memory_size   = var.memory_size
  timeout       = var.timeout
  publish       = true

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  # image_uri と environment は deploy workflow（deploy-aws-min.yml）が正本。
  # Terraform が古い値で上書きしないよう無視する。
  lifecycle {
    ignore_changes = [environment, image_uri]
  }

  tags = var.tags
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.this.function_name
  function_version = aws_lambda_function.this.version

  # どの version に向けるかは deploy workflow が決める（切り戻しも alias の付け替えで行う）
  lifecycle {
    ignore_changes = [function_version]
  }
}
```

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `name` | - | 関数名 |
| `image_uri` | - | **作成時だけ**使うイメージ。以降は deploy workflow が更新する |
| `memory_size` | `512` | MB |
| `timeout` | `30` | 秒 |
| `reserved_concurrent_executions` | `null` | 同時実行数の上限（予約）。`null` なら予約しない |
| `log_retention_in_days` | `3` | prd の `log_retention_days` と同じ |
| `tags` | `{}` | |

outputs: `function_name` / `function_arn` / `alias_name` / `alias_arn` / `alias_invoke_arn` / `role_arn`。

### `modules/api-gateway`（新規）

API Gateway HTTP API、`$default` ルート、Lambda 統合、スロットリング、アクセスログ（CloudWatch Logs）、独自ドメインを作る。

```hcl
resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"

  # 独自ドメイン以外（execute-api の URL）からは呼べないようにする
  disable_execute_api_endpoint = true

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_alias_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000 # HTTP API の上限
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format          = jsonencode({ /** requestId / ip / httpMethod / path / status などの $context 変数 */ })
  }

  # express-rate-limit（in-memory）が Lambda では実質効かないため、ステージ全体で上限をかける
  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowInvokeFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  qualifier     = var.lambda_alias_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_apigatewayv2_domain_name" "this" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  domain_name = aws_apigatewayv2_domain_name.this.id
  stage       = aws_apigatewayv2_stage.default.id
}
```

CORS は API Gateway では設定しない（設定すると API Gateway が preflight に自分で応答し、Express の `cors` と二重になる）。

outputs: `api_id` / `target_domain_name` / `hosted_zone_id`（`aws_apigatewayv2_domain_name.this.domain_name_configuration[0]` の値）。

### `modules/acm`（変数の追加）

ワイルドカードではなく、1 つの FQDN だけの証明書を発行できるようにする。`fqdn`（既定 `null`）を指定すると `domain_name` にその FQDN を使う。既定値では従来どおりワイルドカードなので、prd / dev の plan に差分は出ない。

min は `fqdn = "api.<domain>"` にする。ACM は同じアカウント・同じドメインなら同じ検証用 CNAME を使うため、prd と同じ `*.<domain>` にすると検証レコードを 2 つの state で取り合い、env/min を destroy したときに prd の証明書の更新に必要なレコードまで消える。対象を `api.<domain>` にすれば検証用 CNAME が別になる。

### `modules/ecs-cluster`（変数の追加）

cluster に capacity provider を関連付けられるようにする。既定値（空）では何も作らないので、prd / dev の plan に差分は出ない。

```hcl
variable "capacity_providers" {
  description = "cluster に関連付ける capacity provider（例: [\"FARGATE\", \"FARGATE_SPOT\"]）。空なら関連付けない（launch_type で起動する workload だけの cluster）"
  type        = list(string)
  default     = []
}
```

```hcl
resource "aws_ecs_cluster_capacity_providers" "this" {
  count = length(var.capacity_providers) > 0 ? 1 : 0

  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = var.capacity_providers
}
```

### `modules/ecs-workload`（変数の追加）

service を capacity provider（Fargate Spot）で起動できるようにする。既定値（`null`）では従来どおり `launch_type = "FARGATE"` で起動するので、prd / dev の plan に差分は出ない。

```hcl
variable "capacity_provider" {
  description = "service を起動する capacity provider（例: FARGATE_SPOT）。null なら launch_type = FARGATE で起動する。cluster 側で関連付けておくこと"
  type        = string
  default     = null
}
```

`aws_ecs_service.this` の `launch_type` を次のように変える（`launch_type` と `capacity_provider_strategy` は同時に指定できない）。

```hcl
  launch_type = var.capacity_provider == null ? "FARGATE" : null

  dynamic "capacity_provider_strategy" {
    for_each = var.capacity_provider == null ? [] : [var.capacity_provider]
    content {
      capacity_provider = capacity_provider_strategy.value
      weight            = 1
    }
  }
```

### `env/min/`（新規）

`env/prd` と同じファイル構成にする（`backend.tf` / `provider.tf` / `variables.tf` / `main.tf` / `outputs.tf` / `.trivy.yml` / `.trivyignore`）。

- `backend.tf`: `key = "min/terraform.tfstate"`
- `provider.tf`: prd と同じ。ただし `random` 以外に追加の provider は不要
- `variables.tf`: `environment = "min"`、`vpc_cidr = "10.2.0.0/16"`、`api_subdomain = "api"`、`log_retention_days = 3`、cron の 3 変数（prd と同じ既定値）に加えて次を持つ

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `enable_worker` | `false` | worker（BullMQ の常駐 worker）を作るか。CI の apply は変数を渡さないので、切り替えはこの既定値を変えてコミットする |
| `bootstrap_image_tag` | `"initial"` | api の Lambda と worker の ECS Service を**作成するときだけ**使うイメージのタグ。初回の手順は step4 |
| `api_reserved_concurrency` | `20` | api の Lambda の同時実行数の上限。PlanetScale の内蔵 PgBouncer の client 枠（既定 100）を超えないように絞る。アカウントの同時実行数の上限が 10 のまま（新規アカウント）だと予約できず apply が失敗するので、その場合は `null` にする |
| `api_throttling_burst_limit` | `100` | API Gateway のバースト上限 |
| `api_throttling_rate_limit` | `50` | API Gateway の 1 秒あたりの上限 |

`main.tf` の構成（prd と同じ module はパラメータの差分だけを書く）:

```hcl
locals {
  name_prefix = "${var.project_name}-${var.environment}"

  /** common_tags は prd と同じ */
  common_tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = var.project_name
    },
    var.additional_tags
  )

  public_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  public_subnet_keys  = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
}

/**
 * VPC: worker（ECS Service）と cron / migration（ECS RunTask）のためだけに持つ。
 * public subnet のみで NAT は作らない。タスクには public IP を付けて
 * ECR / Secrets Manager / PlanetScale / Upstash / ClickHouse Cloud へ直接出る。inbound は一切開けない。
 */
module "vpc" {
  source = "../../modules/vpc"

  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  create_internet_gateway = true
  create_nat_gateway      = false

  subnets = {
    for i, az in var.availability_zones :
    local.public_subnet_keys[i] => {
      availability_zone = az
      cidr_block        = local.public_subnet_cidrs[i]
      subnet_type       = "public"
    }
  }

  security_groups = {
    ecs = {
      description = "Security group for ECS tasks (worker / cron / migration)"
      name        = "${local.name_prefix}-ecs"
    }
  }

  security_group_rules = [
    {
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic (ECR / Secrets Manager / external services)"
      from_port           = 0
      protocol            = "-1"
      security_group_name = "ecs"
      to_port             = 0
      type                = "egress"
    },
  ]
}

/**
 * アプリの secret。RDS / ElastiCache が無いので DB_PASSWORD / REDIS_PORT / REDIS_DB は持たない。
 * DATABASE_URL（PlanetScale）と REDIS_URL（Upstash）は scripts/deploy/seed-secrets.sh min で投入する。
 */
module "app_secrets" {
  source = "../../modules/secrets"

  name                    = "/${local.name_prefix}/app"
  recovery_window_in_days = 0

  initial_values = {
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_ACCESS_SECRET      = random_password.jwt_access_secret.result
    JWT_REFRESH_EXPIRATION = "30d"
    JWT_REFRESH_SECRET     = random_password.jwt_refresh_secret.result

    /** ClickHouse Cloud の接続情報。prd と同じく dummy の placeholder（理由は env/prd/main.tf） */
    DATA_WAREHOUSE_DATABASE = "project_template"
    DATA_WAREHOUSE_PASSWORD = "dummy"
    DATA_WAREHOUSE_URL      = "https://dummy.clickhouse.cloud:8443"
    DATA_WAREHOUSE_USER     = "default"

    NODE_ENV = "production"
    PORT     = "8080"
  }

  tags = local.common_tags
}

module "lambda_api" {
  source = "../../modules/lambda-function"

  name                           = "${local.name_prefix}-api"
  image_uri                      = "${data.aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
  memory_size                    = 1024 # コールドスタートを縮めるため（CPU はメモリに比例して割り当てられる）
  timeout                        = 29   # API Gateway の統合タイムアウト（30 秒）より短くする
  reserved_concurrent_executions = var.api_reserved_concurrency
  log_retention_in_days          = var.log_retention_days
  tags                           = local.common_tags
}

/**
 * worker: BullMQ の常駐 worker を Fargate Spot で 1 タスク動かす。enable_worker = false なら作らない
 * （そのとき api は EVENT_TRACKER_TYPE=none でイベントを捨てる。deploy workflow が切り替える）。
 * ALB は付けない（inbound が要らない）。Spot の中断は SIGTERM で通知され、graceful shutdown で
 * 処理中のジョブを終えるか、BullMQ が止まったジョブを拾い直す。
 */
module "ecs_worker" {
  source = "../../modules/ecs-workload"
  count  = var.enable_worker ? 1 : 0

  name   = "${local.name_prefix}-worker"
  image  = "${data.aws_ecr_repository.worker.repository_url}:${var.bootstrap_image_tag}"
  cpu    = 256
  memory = 512

  cluster_arn        = module.ecs_cluster.cluster_arn
  execution_role_arn = module.ecs_cluster.task_execution_role_arn
  subnets            = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
  security_groups    = [module.vpc.security_groups["ecs"].id]
  assign_public_ip   = true
  capacity_provider  = "FARGATE_SPOT"

  secrets_arn = module.app_secrets.secret_arn
  secret_keys = [
    "DATABASE_URL", "REDIS_URL", "NODE_ENV",
    "DATA_WAREHOUSE_URL", "DATA_WAREHOUSE_USER",
    "DATA_WAREHOUSE_PASSWORD", "DATA_WAREHOUSE_DATABASE",
  ]

  /** prd と同じ（ClickHouse Cloud の接続先は secret。実値に差し替えるまでは insert が失敗する） */
  environment = {
    DATA_WAREHOUSE_TYPE = "clickhouse"
  }

  desired_count         = 1
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags

  /** service は cluster に capacity provider が関連付けられた後に作る */
  depends_on = [module.ecs_cluster]
}

module "api_gateway" {
  source = "../../modules/api-gateway"

  name                    = "${local.name_prefix}-api"
  domain_name             = "${var.api_subdomain}.${var.domain_name}"
  certificate_arn         = module.acm.certificate_arn
  lambda_alias_invoke_arn = module.lambda_api.alias_invoke_arn
  lambda_alias_name       = module.lambda_api.alias_name
  lambda_function_name    = module.lambda_api.function_name
  throttling_burst_limit  = var.api_throttling_burst_limit
  throttling_rate_limit   = var.api_throttling_rate_limit
  tags                    = local.common_tags
}

/**
 * api.<domain> → API Gateway の独自ドメイン。
 * modules/route53 は ALB 向け（evaluate_target_health = true）なので使わず、ここで直接書く。
 * prd と同じ FQDN なので、prd の env と同時に apply しないこと（移行は deferred-migrate-to-standard.md）
 */
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = module.api_gateway.target_domain_name
    zone_id                = module.api_gateway.hosted_zone_id
  }
}
```

ほかに prd と同じ形で置くもの（差分だけ記す）:

| リソース | prd との差分 |
| --- | --- |
| `random_password.jwt_*` | 同じ。`db_master` は作らない |
| `data.aws_ecr_repository.*` / `data.aws_route53_zone.primary` | 同じ |
| `module.acm` | `fqdn = "api.<domain>"`（ワイルドカードにしない。理由は上の `modules/acm`） |
| `module.ecs_cluster` | `container_insights_enabled = false`、`capacity_providers = ["FARGATE", "FARGATE_SPOT"]` |
| `module.ecs_migration` / `module.ecs_cron` | `subnets` を public subnet に。`secret_keys` は migration が `["DATABASE_URL"]`、cron が `["DATABASE_URL", "NODE_ENV"]` |
| `module.cron_schedule` | `subnets` を public subnet に、`assign_public_ip = true` |
| ALB / RDS / ElastiCache / api の ECS Service | **作らない** |

`outputs.tf`: `api_url` / `lambda_api_function_name` / `ecs_worker_service_name`（`enable_worker = false` なら `null`）/ `ecs_cluster_name` / `ecs_migration_task_definition_family` / `ecs_cron_task_definition_family` / `public_subnet_ids` / `ecs_security_group_id` / `app_secret_name`。

### `scripts/deploy/seed-secrets.sh`

min は RDS / ElastiCache の output が無いので、既存の「terraform output から組み立てる」処理は自動で skip される。PlanetScale と Upstash の接続文字列を環境変数から受け取る処理を足す。

```bash
# 外部の DB / Redis（minimal 構成の PlanetScale / Upstash 等）。RDS / ElastiCache を持たない環境でだけ使う。
# 変数名を DATABASE_URL / REDIS_URL にしないのは、ローカルのシェルに入っている値を
# 誤って本番の secret に書き込まないため。
add_kv "DATABASE_URL"           "${EXTERNAL_DATABASE_URL:-}"  "env"
add_kv "REDIS_URL"              "${EXTERNAL_REDIS_URL:-}"     "env"
```

RDS / ElastiCache がある環境（dev / prd）では、後段の処理が `DATABASE_URL` / `REDIS_URL` を上書きするので影響しない。ヘッダーコメントの環境変数一覧にも `EXTERNAL_DATABASE_URL` / `EXTERNAL_REDIS_URL` を足す。

### CI / ドキュメント

- `terraform-aws-env-apply.yml` の `environment` の選択肢に `min` を足す
- `terraform-aws-env-ci.yml` は dev だけが対象（ファイル内の TODO）。TODO のとおり matrix にして `dev` / `min` を対象にする
- `infra/terraform/CLAUDE.md` の「構造」と「CI/CD 運用」の表に `env/min` を追記する

## 動作確認

```bash
cd infra/terraform/aws/account && terraform plan   # role / policy / ECR policy の追加だけが出る
cd infra/terraform/aws/env/min
terraform init && terraform validate
terraform fmt -check -recursive -diff ../..
tflint --chdir=. --config=$(pwd)/../../../.tflint.hcl --recursive
trivy config . -c .trivy.yml
terraform plan
```

- [ ] `account/` の plan に、既存リソースの変更・削除が無い（追加だけ）
- [ ] `env/dev` / `env/prd` の plan に差分が出ない（`acm` / `ecs-cluster` / `ecs-workload` に足した変数は既定値が現在の挙動）
- [ ] `env/min` の plan に NAT Gateway / ALB / RDS / ElastiCache が無い。`enable_worker = false`（既定）では ECS Service も無い
- [ ] `terraform plan -var enable_worker=true` で、worker の ECS Service が `FARGATE_SPOT` の capacity provider strategy で作られ、`assign_public_ip = true` になっている
- [ ] trivy の指摘は、意図したもの（public subnet の ECS タスクに public IP を付ける等）だけを理由付きで `.trivyignore` に入れる
- [ ] PlanetScale の port 6432（PgBouncer）に `PGOPTIONS='-c TimeZone=UTC'` 付きで接続でき、`SHOW TimeZone` が `UTC` を返す。接続できなければ [リスク](../README.md#リスクと実装時の確認事項)の「だめだった場合」に従う
- [ ] Upstash に `redis-cli --tls` で接続でき、`PING` が `PONG` を返す。Eviction が無効で、プランが `enable_worker` と合っている（Pay as You Go なら月の予算も設定されている）
- [ ] apply と初回デプロイは step4 の手順で行う
