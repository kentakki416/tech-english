# =============================================================================
# 基本設定
# =============================================================================

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "project-template" # TODO: bootstrapと同じプロジェクト名に変更してください
}

variable "environment" {
  description = "環境名（dev, prd, min）"
  type        = string
  default     = "min"
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

# =============================================================================
# DNS 設定
# =============================================================================

variable "domain_name" {
  description = "Route53 hosted zone のベースドメイン。prd と同じ zone を参照する"
  type        = string
  default     = "project-template.com" # TODO: 実ドメインに変更してください
}

variable "api_subdomain" {
  description = "API の FQDN の左側ラベル。<api_subdomain>.<domain_name> が API の URL になる（prd と同じ FQDN なので、prd と同時に公開しない）"
  type        = string
  default     = "api"
}

# =============================================================================
# ネットワーク設定
# =============================================================================

variable "vpc_cidr" {
  description = "VPCのCIDRブロック（dev / prd と重ならない範囲）"
  type        = string
  default     = "10.2.0.0/16"
}

variable "availability_zones" {
  description = "使用するAvailability Zones"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

# =============================================================================
# アプリケーション設定
# =============================================================================

variable "enable_worker" {
  description = "worker（BullMQ の常駐 worker）を Fargate Spot で作るか。CI の apply は変数を渡さないので、切り替えはこの既定値を変えてコミットする（手順は docs/spec/minimal-deploy/tasks/step4-ci-deploy-min.md）"
  type        = bool
  default     = false
}

variable "bootstrap_image_tag" {
  description = "api の Lambda と worker の ECS Service を作成するときだけ使うイメージのタグ。以降は deploy workflow が更新する"
  type        = string
  default     = "initial"
}

variable "api_reserved_concurrency" {
  description = "api の Lambda の同時実行数の上限。PlanetScale の内蔵 PgBouncer の client 枠 (既定 100) を超えないように絞る。アカウントの同時実行数の上限が 10 のまま (新規アカウント) だと予約できず apply が失敗するので、その場合は null にする"
  type        = number
  default     = 20
}

variable "api_throttling_burst_limit" {
  description = "API Gateway のバースト上限（リクエスト数）"
  type        = number
  default     = 100
}

variable "api_throttling_rate_limit" {
  description = "API Gateway の 1 秒あたりのリクエスト上限"
  type        = number
  default     = 50
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
# タグ設定
# =============================================================================

variable "additional_tags" {
  description = "追加のタグ"
  type        = map(string)
  default     = {}
}
