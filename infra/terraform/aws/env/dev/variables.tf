# =============================================================================
# 基本設定
# =============================================================================

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "tech-english"
}

variable "environment" {
  description = "環境名（dev, stg, prd）"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}


# =============================================================================
# DNS 設定
# =============================================================================
# hosted zone は prd で作成 / 管理する。dev は data source で参照するため、
# domain_name は prd と必ず同じ値にすること (テンプレ既定値は prd と同じ)。

variable "domain_name" {
  description = "Route53 hosted zone のベースドメイン (prd で作成済みの zone)。dev は data source で参照する"
  type        = string
  default     = "tech-english.com" # TODO: prd と揃えて実ドメインに変更してください
}

variable "subdomain" {
  description = "dev 用サブドメイン。<api_subdomain>.<subdomain>.<domain_name> が API の FQDN になる (例: api.dev.tech-english.com)"
  type        = string
  default     = "dev"
}

variable "api_subdomain" {
  description = "API の FQDN の左側ラベル"
  type        = string
  default     = "api"
}

# =============================================================================
# ネットワーク設定
# =============================================================================

variable "vpc_cidr" {
  description = "VPCのCIDRブロック"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "使用するAvailability Zones"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

# =============================================================================
# アプリケーション設定
# =============================================================================

variable "app_port" {
  description = "アプリケーションのポート番号"
  type        = number
  default     = 8080
}

# =============================================================================
# ECS設定
# =============================================================================

variable "ecs_task_cpu" {
  description = "ECSタスクのCPUユニット（256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU）"
  type        = string
  default     = "256"
}

variable "ecs_task_memory" {
  description = "ECSタスクのメモリ（MB）"
  type        = string
  default     = "512"
}

variable "log_retention_days" {
  description = "CloudWatch Logsの保存期間（日数）"
  type        = number
  default     = 3
}

# =============================================================================
# cron スケジュール設定 (EventBridge Scheduler → ECS RunTask)
# =============================================================================

variable "cron_schedule_expression" {
  description = "cron task の起動スケジュール (cron() または rate() 式)。デフォルトは毎日 04:00"
  type        = string
  default     = "cron(0 4 * * ? *)"
}

variable "cron_schedule_timezone" {
  description = "cron_schedule_expression を解釈するタイムゾーン (IANA 名)"
  type        = string
  default     = "Asia/Tokyo"
}

variable "cron_schedule_state" {
  description = "cron スケジュールの有効/無効 (ENABLED / DISABLED)"
  type        = string
  default     = "ENABLED"
}

# =============================================================================
# データウェアハウス (ClickHouse Cloud)
# =============================================================================

variable "enable_data_warehouse" {
  description = "ClickHouse Cloud のサービスを作り、worker の書き込み先と ClickHouse の migration を有効にするか。CI の apply はフラグの変数を渡さないので、切り替えはこの既定値を変えてコミットする（手順は docs/spec/clickhouse-migration/tasks/step4-ci-deploy-dwh-migration.md）"
  type        = bool
  default     = false
}

/**
 * ClickHouse Cloud の API の認証情報。Terraform の workflow が GitHub Environment の secret (CLICKHOUSE_*) を TF_VAR_* で渡す。
 * enable_data_warehouse = false の環境では渡さなくてよい（provider には "unused" を渡す）
 */
variable "clickhouse_org_id" {
  description = "ClickHouse Cloud の organization ID"
  type        = string
  default     = null
  sensitive   = true
}

variable "clickhouse_token_key" {
  description = "ClickHouse Cloud の API キーの key ID"
  type        = string
  default     = null
  sensitive   = true
}

variable "clickhouse_token_secret" {
  description = "ClickHouse Cloud の API キーの secret"
  type        = string
  default     = null
  sensitive   = true
}

variable "clickhouse_additional_ip_access_cidrs" {
  description = "ClickHouse Cloud のサービスへの接続を、NAT の IP に加えて許す送信元の CIDR (分析ツールや手元の IP)。コンソールで足した IP は次の apply で消えるため、ここに足してコミットする"
  type        = list(string)
  default     = []
}

variable "enable_cdc" {
  description = "Postgres (RDS) から ClickHouse への CDC (ClickPipes + SSH bastion) を作るか。enable_data_warehouse = true のときだけ有効にできる。ClickPipes の CDC 用の計算資源 (約 $73/月) と bastion (月 $10 未満) の固定費がかかる"
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_cdc || var.enable_data_warehouse
    error_message = "enable_cdc = true には enable_data_warehouse = true が要る"
  }
}

# =============================================================================
# タグ設定
# =============================================================================

variable "additional_tags" {
  description = "追加のタグ"
  type        = map(string)
  default     = {}
}

# =============================================================================
# Secrets (アプリケーション機密)
# =============================================================================
# 方針: Terraform は「箱」(Secrets Manager secret) と「初回 JWT 自動生成」までを管理し、
# 残りの値 (DATABASE_URL / REDIS_HOST / GOOGLE_* / LIVEKIT_* / FRONTEND_URL) は
# Console / CLI で手動登録する。secret_version は ignore_changes でガード済み。
#
# dev/prd で運用差を作らないため変数化はしない。
