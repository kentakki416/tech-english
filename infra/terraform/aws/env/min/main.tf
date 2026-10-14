# =============================================================================
# Min Environment - Main Configuration
# =============================================================================
# リクエストが無いときの固定費をほぼゼロにした本番構成 (minimal)。prd との差分:
#   - api は Lambda (Lambda Web Adapter) + API Gateway HTTP API。ALB / NAT は作らない
#   - DB は PlanetScale、Redis は Upstash (どちらも Terraform の管理外。接続文字列は seed-secrets.sh で投入)
#   - worker は enable_worker のときだけ Fargate Spot で作る
#   - cron / migration は public subnet + public IP の ECS RunTask
# 設計: docs/spec/minimal-deploy/README.md

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * サブネットは public のみ (10.2.1.0/24, 10.2.2.0/24)。NAT を作らず、
   * ECS task は public IP を付けて外部 (ECR / Secrets Manager / PlanetScale / Upstash 等) へ直接出る。
   * キーは dev / prd と同じ「<role><az-suffix>」の規約 (例: public1-a / public1-c)
   */
  public_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  public_subnet_keys  = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )
}

# =============================================================================
# ネットワーク設定 (VPC, サブネット, セキュリティグループ)
# =============================================================================
# worker (ECS Service) と cron / migration (ECS RunTask) のためだけに持つ。
# api の Lambda は VPC の外に置く。inbound は一切開けない。

module "vpc" {
  source = "../../modules/vpc"

  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true
  create_nat_gateway      = false

  subnets = {
    for i, az in var.availability_zones :
    local.public_subnet_keys[i] => {
      cidr_block        = local.public_subnet_cidrs[i]
      availability_zone = az
      subnet_type       = "public"
    }
  }

  security_groups = {
    ecs = {
      name        = "${local.name_prefix}-ecs"
      description = "Security group for ECS tasks (worker / cron / migration)"
    }
  }

  security_group_rules = [
    # ECS Egress - public IP で外部 (ECR / Secrets Manager / PlanetScale / Upstash / ClickHouse Cloud) へ
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic via public IP"
    },
  ]
}

# =============================================================================
# アプリケーション機密 (Secrets Manager)
# =============================================================================
# 方針は prd と同じ (箱と JWT の初回投入だけを Terraform が持ち、以降は ignore_changes)。
# RDS / ElastiCache が無いので DB_PASSWORD / REDIS_PORT / REDIS_DB は持たない。
# DATABASE_URL (PlanetScale) と REDIS_URL (Upstash) は scripts/deploy/seed-secrets.sh min で投入する。

resource "random_password" "jwt_access_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

module "app_secrets" {
  source = "../../modules/secrets"

  name                    = "/${local.name_prefix}/app"
  recovery_window_in_days = 0

  initial_values = {
    JWT_ACCESS_SECRET      = random_password.jwt_access_secret.result
    JWT_REFRESH_SECRET     = random_password.jwt_refresh_secret.result
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_REFRESH_EXPIRATION = "30d"

    NODE_ENV = "production"
    PORT     = "8080"
  }

  tags = local.common_tags
}

# =============================================================================
# ClickHouse Cloud (enable_data_warehouse のときだけ)
# =============================================================================
# prd と同じ (deploy workflow はこの secret の有無で ClickHouse の migration を流すかを判定する)。
# ただし NAT が無く、worker と migration のタスクの public IP は起動のたびに変わるため、
# 接続元は絞らずパスワードで守る。
# 設計: docs/spec/clickhouse-migration/README.md

module "clickhouse" {
  source = "../../modules/clickhouse-service"
  count  = var.enable_data_warehouse ? 1 : 0

  name            = local.name_prefix
  region          = var.aws_region
  secret_name     = "/${local.name_prefix}/data-warehouse"
  ip_access_cidrs = ["0.0.0.0/0"]

  # ClickHouse の default ユーザーのパスワードを作り直したら +1 する (手順は modules/clickhouse-service/main.tf)
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

# =============================================================================
# コンテナレジストリ (ECR) / DNS / 証明書
# =============================================================================

# account/ で作成済みの ECR リポジトリを参照
data "aws_ecr_repository" "api" {
  name = "${var.project_name}-api-server"
}

data "aws_ecr_repository" "worker" {
  name = "${var.project_name}-worker"
}

data "aws_ecr_repository" "migration" {
  name = "${var.project_name}-migration"
}

data "aws_ecr_repository" "cron" {
  name = "${var.project_name}-cron"
}

# Route 53 Domains でドメインを登録したときに自動作成される zone を参照する (dev / prd と同じ)
data "aws_route53_zone" "primary" {
  name         = var.domain_name
  private_zone = false
}

# api.<domain> だけの証明書 (ワイルドカードにしない)。
# prd の *.<domain> とは ACM の検証用 CNAME が別になり、env/min を destroy しても prd の証明書の更新に影響しない
module "acm" {
  source = "../../modules/acm"

  domain_name = var.domain_name
  fqdn        = "${var.api_subdomain}.${var.domain_name}"
  zone_id     = data.aws_route53_zone.primary.zone_id

  tags = local.common_tags
}

# =============================================================================
# api: Lambda (Lambda Web Adapter) + API Gateway HTTP API
# =============================================================================
# 同じ api イメージを Lambda で動かす。環境変数・イメージ・alias の向き先は deploy workflow が更新する。

module "lambda_api" {
  source = "../../modules/lambda-function"

  name                           = "${local.name_prefix}-api"
  image_uri                      = "${data.aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
  memory_size                    = 1024 # コールドスタートを縮めるため (CPU はメモリに比例して割り当てられる)
  timeout                        = 29   # API Gateway の統合タイムアウト (30 秒) より短くする
  reserved_concurrent_executions = var.api_reserved_concurrency
  log_retention_in_days          = var.log_retention_days
  tags                           = local.common_tags
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
  log_retention_in_days   = var.log_retention_days
  tags                    = local.common_tags
}

# api.<domain> → API Gateway の独自ドメイン。
# modules/route53 は ALB 向け (evaluate_target_health = true 固定) なので使わず、ここで直接書く。
# prd と同じ FQDN なので、prd と同時に公開しないこと (移行手順は docs/spec/minimal-deploy/deferred-migrate-to-standard.md)
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

# =============================================================================
# ECS Fargate Cluster (worker / cron / migration 用)
# =============================================================================

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  name = "${local.name_prefix}-cluster"

  # worker を Fargate Spot で起動するため。cron / migration は従来どおり launch_type = FARGATE
  capacity_providers         = ["FARGATE", "FARGATE_SPOT"]
  container_insights_enabled = false
  secret_arns_readable       = concat([module.app_secrets.secret_arn], module.clickhouse[*].secret_arn)

  tags = local.common_tags
}

locals {
  ecs_common = {
    cluster_arn        = module.ecs_cluster.cluster_arn
    execution_role_arn = module.ecs_cluster.task_execution_role_arn
    subnets            = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
    security_groups    = [module.vpc.security_groups["ecs"].id]
    secrets_arn        = module.app_secrets.secret_arn
  }

  # **ここに足すキーは Secrets Manager 側に値が存在していること** (理由は env/prd/main.tf)。
  # api は Lambda なので ECS の secret_keys は持たない (deploy workflow が環境変数に注入する)
  # DATA_WAREHOUSE_* は app secret ではなく local.data_warehouse_secrets から渡す
  secret_keys = {
    worker    = ["DATABASE_URL", "REDIS_URL", "NODE_ENV"]
    cron      = ["DATABASE_URL", "NODE_ENV"]
    migration = ["DATABASE_URL"]
  }
}

# =============================================================================
# ECS Workload: worker (BullMQ 常駐。enable_worker のときだけ Fargate Spot で作る)
# =============================================================================
# - enable_worker = false (既定) なら作らない。そのとき api は EVENT_TRACKER_TYPE=none でイベントを捨てる
#   (deploy workflow が worker の Service の有無を見て切り替える)
# - ALB は付けない (inbound が要らない)。Spot の中断は SIGTERM で通知され、graceful shutdown で
#   処理中のジョブを終えるか、BullMQ が止まったジョブとして拾い直す

module "ecs_worker" {
  source = "../../modules/ecs-workload"
  count  = var.enable_worker ? 1 : 0

  name   = "${local.name_prefix}-worker"
  image  = "${data.aws_ecr_repository.worker.repository_url}:${var.bootstrap_image_tag}"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups
  assign_public_ip   = true
  capacity_provider  = "FARGATE_SPOT"

  secrets_arn        = local.ecs_common.secrets_arn
  secret_keys        = local.secret_keys.worker
  additional_secrets = local.data_warehouse_secrets

  # prd と同じ (enable_data_warehouse = false なら何も書き込まない実装を使わせる)
  environment = {
    DATA_WAREHOUSE_TYPE = var.enable_data_warehouse ? "clickhouse" : "none"
  }

  desired_count         = 1
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags

  # service は cluster に capacity provider が関連付けられた後に作る
  depends_on = [module.ecs_cluster]
}

# =============================================================================
# ECS Workload: DB migration / ClickHouse migration / cron (one-shot task definition、Service なし)
# =============================================================================
# prd と同じ。起動時は public IP を付ける (migration は deploy workflow の run-task、cron は下の schedule)

module "ecs_migration" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-migration"
  image  = "${data.aws_ecr_repository.migration.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.secret_keys.migration

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

/** ClickHouse の migration。prd と同じ (enable_data_warehouse のときだけ作る) */
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

  additional_secrets = local.data_warehouse_secrets
  environment = {
    /** min は CDC を張らない */
    DATA_WAREHOUSE_CDC = "none"
    /** logger を JSON 出力にする (未設定だと development 扱いで色付きのテキストになる) */
    NODE_ENV = "production"
  }

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

module "ecs_cron" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-cron"
  image  = "${data.aws_ecr_repository.cron.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.secret_keys.cron

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

module "cron_schedule" {
  source = "../../modules/ecs-schedule-task"

  name                   = "${local.name_prefix}-cron"
  cluster_arn            = local.ecs_common.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = local.ecs_common.execution_role_arn
  subnets                = local.ecs_common.subnets
  security_groups        = local.ecs_common.security_groups
  assign_public_ip       = true

  schedule_expression          = var.cron_schedule_expression
  schedule_expression_timezone = var.cron_schedule_timezone
  state                        = var.cron_schedule_state

  tags = local.common_tags
}
