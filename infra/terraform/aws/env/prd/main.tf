# =============================================================================
# Prd Environment - Main Configuration
# =============================================================================
# dev とほぼ同一構成。差分は以下:
#   - environment = "prd" / vpc_cidr = 10.1.0.0/16 / state key = prd/terraform.tfstate
#   - ALB と ecs_api で enable_blue_green = true (Blue/Green デプロイ)

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * サブネット CIDR の計算
   * - public:   10.1.1.0/24, 10.1.2.0/24  (ALB / NAT Gateway 配置)
   * - private:  10.1.11.0/24, 10.1.12.0/24 (ECS task 配置、NAT 経由で outbound)
   * - isolated: 10.1.21.0/24, 10.1.22.0/24 (RDS / ElastiCache 配置)
   *
   * modules/vpc は public/private しか subnet_type を持たないため isolated も "private" 扱いとし、
   * 結果的に NAT route table に紐付くが RDS/Redis は outbound を開始しないため問題なし。
   */
  public_subnet_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnet_cidrs  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 11)]
  isolated_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 21)]

  /**
   * subnet キーは「<role><az-suffix>」の規約。既存の public 命名と整合させる。
   * 例: public1-a / public1-c / private1-a / private1-c / isolated1-a / isolated1-c
   */
  public_subnet_keys   = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  private_subnet_keys  = [for az in var.availability_zones : "private${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  isolated_subnet_keys = [for az in var.availability_zones : "isolated${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]

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

# - NAT Gateway 1 個（dev と同等構成のためコスト優先）
module "vpc" {
  source = "../../modules/vpc"

  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true
  create_nat_gateway      = true
  nat_gateway_subnet_key  = local.public_subnet_keys[0]

  subnets = merge(
    {
      for i, az in var.availability_zones :
      local.public_subnet_keys[i] => {
        cidr_block        = local.public_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "public"
      }
    },
    {
      for i, az in var.availability_zones :
      local.private_subnet_keys[i] => {
        cidr_block        = local.private_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
    {
      for i, az in var.availability_zones :
      local.isolated_subnet_keys[i] => {
        cidr_block        = local.isolated_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
  )

  security_groups = {
    alb = {
      name        = "${local.name_prefix}-alb"
      description = "Security group for ALB"
    }
    ecs = {
      name        = "${local.name_prefix}-ecs"
      description = "Security group for ECS tasks"
    }
    rds = {
      name        = "${local.name_prefix}-rds"
      description = "Security group for RDS Postgres"
    }
    redis = {
      name        = "${local.name_prefix}-redis"
      description = "Security group for ElastiCache Redis"
    }
  }

  security_group_rules = [
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 443
      to_port             = 443
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTPS from internet"
    },
    # ALB Ingress - HTTP は当面 SG 上は開けておく (将来 HTTP→HTTPS リダイレクト listener を追加するときに使う)
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 80
      to_port             = 80
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTP from internet (placeholder for future redirect listener)"
    },
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 9000
      to_port             = 9000
      protocol            = "tcp"
      cidr_blocks         = var.test_listener_allowed_cidrs
      description         = "Test listener for Blue/Green deployment"
    },
    {
      security_group_name = "alb"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic"
    },
    {
      security_group_name        = "ecs"
      type                       = "ingress"
      from_port                  = var.app_port
      to_port                    = var.app_port
      protocol                   = "tcp"
      source_security_group_name = "alb"
      description                = "From ALB only"
    },
    # ECS Egress - NAT 経由で外部 (ECR / Secrets Manager / LiveKit Cloud) へ
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic via NAT"
    },
    {
      security_group_name        = "rds"
      type                       = "ingress"
      from_port                  = 5432
      to_port                    = 5432
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Postgres from ECS"
    },
    {
      security_group_name        = "redis"
      type                       = "ingress"
      from_port                  = 6379
      to_port                    = 6379
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Redis from ECS"
    },
  ]

}

# =============================================================================
# アプリケーション機密 (Secrets Manager)
# =============================================================================

# JWT 署名鍵 (Access / Refresh) は Terraform 内で自動生成して Secrets Manager に投入する。
# 外部から提供される値ではないので random_password で十分。
# tfstate に値が残るが、S3 KMS 暗号化で保護される前提。
#
# 鍵が変わると既存トークンが全部 invalid になりユーザーが一斉ログアウトするため、
# 引数 (length / special 等) の意図しない変更で再生成されないよう ignore_changes でガード。
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

# DB マスターパスワードの初期値。
# RDS の禁止文字 (スラッシュ / アットマーク / ダブルクォート / スペース) を避けた記号のみ使う。
resource "random_password" "db_master" {
  length           = 28
  override_special = "!#$%&*()-_=+[]{}<>:?"
  special          = true

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

# Application secrets
# 「箱だけ Terraform で管理 + JWT のみ初回投入」方針:
# - 初回 apply で JWT (random_password) と基本定数のみ Secrets Manager に書く
# - DATABASE_URL / REDIS_HOST / GOOGLE_* / LIVEKIT_* / FRONTEND_URL は scripts/deploy/seed-secrets.sh で投入
# - JWT を rotate するときは `terraform taint random_password.jwt_xxx` 後、
#   Secrets Manager Console で JWT_ACCESS_SECRET / JWT_REFRESH_SECRET を新値で上書き
#
# recovery_window_in_days = 0: dev と同等構成 (誤削除リスクは運用ルールでガード)。
# 強化したい場合は 7 以上に変更すること。
module "app_secrets" {
  source = "../../modules/secrets"

  name                    = "/${local.name_prefix}/app"
  recovery_window_in_days = 0

  initial_values = {
    JWT_ACCESS_SECRET      = random_password.jwt_access_secret.result
    JWT_REFRESH_SECRET     = random_password.jwt_refresh_secret.result
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_REFRESH_EXPIRATION = "30d"

    /**
     * DB マスターパスワード。module.rds が ephemeral で読む唯一の情報源。
     * 初回 apply でのみこの random 初期値が入り、以降の変更は secret 側で直接行う。
     * DATABASE_URL は同じパスワードから scripts/deploy/seed-secrets.sh が構築する。
     */
    DB_PASSWORD = random_password.db_master.result

    REDIS_PORT = "6379"
    REDIS_DB   = "0"

    NODE_ENV = "production"
    PORT     = "8080"
  }

  tags = local.common_tags
}

# =============================================================================
# RDS Postgres 16
# =============================================================================
# - isolated subnet に配置

# app secret から DB マスターパスワードを読む。ephemeral resource なので
# 読んだ値は plan / state のどちらにも保存されない。
ephemeral "aws_secretsmanager_secret_version" "app" {
  secret_id = module.app_secrets.seeded_secret_id
}

locals {
  /**
   * DB マスターパスワードの版。app secret の DB_PASSWORD を変更したら +1 して apply する。
   * RDS と ClickPipe の両方に渡す (片方だけ上げると、ClickPipe が古いパスワードのまま認証に失敗して CDC が止まる)
   */
  db_password_version = 1
}

module "rds" {
  source = "../../modules/rds"

  name = "${local.name_prefix}-db"
  # メジャーバージョンのみ指定。auto_minor_version_upgrade=true なので AWS が
  # 利用可能な最新マイナーを選ぶ。マイナーピン留め (例: 16.6) は AWS が EOL で
  # 廃止すると create 時に "Cannot find version" で落ちるため避ける。
  engine_version    = "16"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  db_name           = "tech_english"
  master_username   = "techenglish"

  master_password         = jsondecode(ephemeral.aws_secretsmanager_secret_version.app.secret_string)["DB_PASSWORD"]
  master_password_version = local.db_password_version

  /**
   * CDC (ClickPipes) 用に論理レプリケーションを常に有効にする。
   * enable_cdc に連動させると「apply → 再起動 → もう一度 apply」の 2 段になるため、
   * 再起動が要るのはこのパラメータグループを入れるときの 1 回だけにする (手順は docs/tech-stack/clickhouse/cdc.md)。
   * slot が無い間は WAL を溜め込まないので、常に有効でも WAL が少し増える程度。
   */
  parameters = [
    { name = "rds.logical_replication", value = "1" },
    /**
     * slot が保持できる WAL の上限 (MB)。ClickPipe が止まったまま WAL が溜まり続けて
     * ディスクが埋まるのを防ぐ。超えると slot が無効になり CDC は止まるが、DB は止まらない
     */
    { name = "max_slot_wal_keep_size", value = "5120", apply_method = "immediate" },
  ]

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["rds"].id]

  multi_az                = false
  backup_retention_period = 7

  # メンテ / バックアップ時間帯は JST 早朝 (UTC -9h) に寄せる
  # backup: JST 02:00-03:00 / maintenance: JST 日曜 03:00-04:00
  backup_window      = "17:00-18:00"
  maintenance_window = "sun:18:00-sun:19:00"

  # dev と同等構成。強化する場合は deletion_protection = true / skip_final_snapshot = false に変更すること。
  deletion_protection = false
  skip_final_snapshot = true

  tags = local.common_tags
}

# =============================================================================
# ElastiCache Redis 7
# =============================================================================
# - isolated subnet に配置

module "elasticache" {
  source = "../../modules/elasticache"

  name           = "${local.name_prefix}-redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.micro"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["redis"].id]

  # dev と同等の最小構成
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  # snapshot 取らない
  snapshot_retention_limit = 0

  # TLS in-transit はクライアント設定が必要になるので OFF
  transit_encryption_enabled = false

  # メンテ時間帯 (UTC)。AWS 仕様で snapshot_window と maintenance_window は overlap 不可。
  # snapshot: 毎日 18:00-19:00 UTC (JST 03:00-04:00)
  # maintenance: 月曜 19:00-20:00 UTC (JST 月曜 04:00-05:00)
  snapshot_window    = "18:00-19:00"
  maintenance_window = "mon:19:00-mon:20:00"

  tags = local.common_tags
}

# =============================================================================
# ClickHouse Cloud (enable_data_warehouse のときだけ)
# =============================================================================
# - 接続情報 (DATA_WAREHOUSE_*) は /<prefix>/data-warehouse の secret に入れ、worker と
#   dwh-migration にだけ渡す
# - 接続を許すのは、worker と migration のタスクが外へ出る NAT の IP と、
#   clickhouse_additional_ip_access_cidrs に足した IP (分析ツールなど) だけ
# 設計: docs/spec/clickhouse-migration/README.md

module "clickhouse" {
  source = "../../modules/clickhouse-service"
  count  = var.enable_data_warehouse ? 1 : 0

  name            = local.name_prefix
  region          = var.aws_region
  secret_name     = "/${local.name_prefix}/data-warehouse"
  ip_access_cidrs = concat(["${module.vpc.nat_gateway_public_ip}/32"], var.clickhouse_additional_ip_access_cidrs)

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
# CDC: Postgres (RDS) → ClickHouse Cloud (enable_cdc のときだけ)
# =============================================================================
# - ClickPipes が SSH bastion 経由で RDS の論理レプリケーションを読み、pg_cdc に取り込む
# - 同期の対象は infra/clickhouse/cdc-tables.json。変えたら apply で ClickPipe に反映する

module "cdc" {
  source = "../../modules/clickpipes-postgres-cdc"
  count  = var.enable_cdc ? 1 : 0

  name                  = local.name_prefix
  service_id            = module.clickhouse[0].service_id
  vpc_id                = module.vpc.vpc_id
  public_subnet_id      = module.vpc.subnets[local.public_subnet_keys[0]].id
  rds_security_group_id = module.vpc.security_groups["rds"].id
  rds_address           = module.rds.address
  rds_port              = module.rds.port
  rds_database          = module.rds.db_name
  rds_username          = module.rds.master_username
  rds_password          = jsondecode(ephemeral.aws_secretsmanager_secret_version.app.secret_string)["DB_PASSWORD"]
  rds_password_version  = local.db_password_version

  /** CDC 対象の一覧の正本。ローカルの migration コマンドも同じファイルを読む */
  tables = jsondecode(file("${path.module}/../../../../clickhouse/cdc-tables.json"))

  tags = local.common_tags
}

# =============================================================================
# コンテナレジストリ (ECR)
# =============================================================================

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

# =============================================================================
# Route53 hosted zone（Route 53 Domains 購入時に自動作成される zone を参照）
# =============================================================================
# - Route 53 Domains でドメインを登録すると AWS が同名の hosted zone を自動作成し、
#   Registrar 側の NS もそこへ自動設定される（公式ドキュメント参照）
# - Terraform 側では新たに zone を作らず、data source で既存 zone を引くだけにする
# - dev / prd で同じ zone を参照するため env 同士に infra 依存は生まれない

data "aws_route53_zone" "primary" {
  name         = var.domain_name
  private_zone = false
}

# =============================================================================
# ACM 証明書 (*.tech-english.com)
# =============================================================================
# - prd は apex 直下に配置するので subdomain は空文字を渡す
# - 検証用 CNAME は primary zone に書き込まれる

module "acm" {
  source = "../../modules/acm"

  domain_name = var.domain_name
  subdomain   = ""
  zone_id     = data.aws_route53_zone.primary.zone_id

  tags = local.common_tags
}

# =============================================================================
# ロードバランサー設定 (Application Load Balancer)
# =============================================================================

# - インターネットからの通信を受けてECSに振り分け
# - prd は Blue/Green デプロイ用に test listener (port 9000) と TG-b を作成する
module "alb" {
  source = "../../modules/alb"

  name            = "${local.name_prefix}-alb"
  vpc_id          = module.vpc.vpc_id
  security_groups = [module.vpc.security_groups["alb"].id]
  subnets         = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]

  target_group_name_prefix = "${local.name_prefix}-api"
  target_group_port        = var.app_port
  listener_port            = "80"

  # ACM ワイルドカード (*.tech-english.com) を HTTPS listener (443) にアタッチ
  enable_https    = true
  certificate_arn = module.acm.certificate_arn

  # prd は Blue/Green デプロイで運用する。dev は通常 (rolling) デプロイ。
  enable_blue_green = true

  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-alb"
      Component = "LoadBalancer"
    }
  )
}

# =============================================================================
# Route53 A レコード (api.tech-english.com → ALB)
# =============================================================================

module "route53_api" {
  source = "../../modules/route53"

  zone_id      = data.aws_route53_zone.primary.zone_id
  fqdn         = "${var.api_subdomain}.${var.domain_name}"
  alb_dns_name = module.alb.alb_dns_name
  alb_zone_id  = module.alb.alb_zone_id
}

# =============================================================================
# ECS Fargate Cluster
# =============================================================================

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  name = "${local.name_prefix}-cluster"

  secret_arns_readable = concat([module.app_secrets.secret_arn], module.clickhouse[*].secret_arn)

  tags = local.common_tags
}

# ECS workload の「デフォルト」共通設定。
locals {
  ecs_common = {
    cluster_arn        = module.ecs_cluster.cluster_arn
    execution_role_arn = module.ecs_cluster.task_execution_role_arn
    subnets            = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
    security_groups    = [module.vpc.security_groups["ecs"].id]
    secrets_arn        = module.app_secrets.secret_arn
  }

  # Secrets Manager のキーを workload ごとに宣言する。
  # 各 app が実際に読む env は apps/{app}/src/env.ts が正典なので、増減時はそちらと突き合わせる。
  #
  # **ここに足すキーは Secrets Manager 側に値が存在していること。** ECS は存在
  # しないキーを valueFrom で参照するとタスクの起動自体に失敗する
  # (ResourceInitializationError)。値は scripts/deploy/seed-secrets.sh か
  # module.app_secrets の initial_values で投入する。
  secret_keys = {
    api = [
      "DATABASE_URL", "REDIS_URL",
      "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET",
      "JWT_ACCESS_EXPIRATION", "JWT_REFRESH_EXPIRATION",
      "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
      "FRONTEND_URL", "NODE_ENV", "PORT",
    ]
    # DATA_WAREHOUSE_* は app secret ではなく local.data_warehouse_secrets から渡す
    worker    = ["DATABASE_URL", "REDIS_URL", "NODE_ENV"]
    cron      = ["DATABASE_URL", "NODE_ENV"]
    migration = ["DATABASE_URL"]
  }
}

# =============================================================================
# ECS Workload: API (Express on Fargate, ALB + Blue/Green デプロイ)
# =============================================================================

module "ecs_api" {
  source = "../../modules/ecs-workload"

  name           = "${local.name_prefix}-api"
  image          = "${data.aws_ecr_repository.api.repository_url}:latest"
  cpu            = tonumber(var.ecs_task_cpu)
  memory         = tonumber(var.ecs_task_memory)
  container_port = var.app_port
  desired_count  = 1

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn = local.ecs_common.secrets_arn
  secret_keys = local.secret_keys.api

  target_group_arn             = module.alb.target_group_a_arn
  enable_blue_green            = true
  alternate_target_group_arn   = module.alb.target_group_b_arn
  production_listener_rule_arn = module.alb.listener_rule_arn
  test_listener_rule_arn       = module.alb.test_listener_rule_arn
  bake_time_in_minutes         = 5

  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: worker (BullMQ ジョブ消化、ALB なし、Blue/Green なし)
# =============================================================================

module "ecs_worker" {
  source = "../../modules/ecs-workload"

  name   = "${local.name_prefix}-worker"
  image  = "${data.aws_ecr_repository.worker.repository_url}:latest"
  cpu    = 256
  memory = 512

  cluster_arn        = local.ecs_common.cluster_arn
  execution_role_arn = local.ecs_common.execution_role_arn
  subnets            = local.ecs_common.subnets
  security_groups    = local.ecs_common.security_groups

  secrets_arn        = local.ecs_common.secrets_arn
  secret_keys        = local.secret_keys.worker
  additional_secrets = local.data_warehouse_secrets

  # 秘密情報ではないので secrets ではなく平文の environment で渡す。
  environment = {
    DATA_WAREHOUSE_TYPE = var.enable_data_warehouse ? "clickhouse" : "none"
  }

  # 先に ECR へ image を push してから apply する前提で 1 固定。
  # image が未 push の状態で apply すると ECS task が CannotPullContainerError で
  # 失敗するが、deploy workflow から image を push + task definition 更新すれば
  # ECS が自動で再 pull して正常化するため、運用上は問題にしない。
  desired_count         = 1
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: DB migration (one-shot task definition、Service なし)
# =============================================================================
# - GHA から `aws ecs run-task --task-definition <family>` で起動する想定
# - Dockerfile の CMD = `pnpm --filter @repo/db db:migrate` (drizzle-kit migrate) を
#   そのまま使うので command override は不要

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

# =============================================================================
# ECS Workload: ClickHouse migration (one-shot task definition、Service なし)
# =============================================================================
# - enable_data_warehouse のときだけ作る
# - イメージは DB migration と同じで、command で ClickHouse の migration コマンドを起動する

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
    DATA_WAREHOUSE_CDC = var.enable_cdc ? "clickpipes" : "none"
    /** logger を JSON 出力にする (未設定だと development 扱いで色付きのテキストになる) */
    NODE_ENV = "production"
  }

  create_service        = false
  log_retention_in_days = var.log_retention_days
  tags                  = local.common_tags
}

# =============================================================================
# ECS Workload: cron (定期実行タスク。one-shot task definition、Service なし)
# =============================================================================
# - task definition のみ作成し、起動は下の cron_schedule (EventBridge Scheduler) が行う
# - Dockerfile の CMD (cleanup-old-memos) をそのまま使うので command override は不要

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

# =============================================================================
# EventBridge Scheduler: cron task の定期起動
# =============================================================================

module "cron_schedule" {
  source = "../../modules/ecs-schedule-task"

  name                   = "${local.name_prefix}-cron"
  cluster_arn            = local.ecs_common.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = local.ecs_common.execution_role_arn
  subnets                = local.ecs_common.subnets
  security_groups        = local.ecs_common.security_groups

  schedule_expression          = var.cron_schedule_expression
  schedule_expression_timezone = var.cron_schedule_timezone
  state                        = var.cron_schedule_state

  tags = local.common_tags
}
