variable "name" {
  description = "リソース名のベース (例: tech-english-dev)"
  type        = string
}

variable "service_id" {
  description = "取り込み先の ClickHouse Cloud のサービス ID (modules/clickhouse-service の出力)"
  type        = string
}

# =============================================================================
# bastion の置き場所
# =============================================================================

variable "vpc_id" {
  description = "bastion を置く VPC の ID"
  type        = string
}

variable "public_subnet_id" {
  description = "bastion を置く public subnet の ID (ClickPipes がインターネットから SSH で繋ぐ)"
  type        = string
}

# =============================================================================
# 取り込み元 (RDS)
# =============================================================================

variable "rds_security_group_id" {
  description = "RDS の Security Group の ID。bastion からの 5432 を受ける rule を足す"
  type        = string
}

variable "rds_address" {
  description = "RDS のホスト名"
  type        = string
}

variable "rds_port" {
  description = "RDS のポート"
  type        = number
  default     = 5432
}

variable "rds_database" {
  description = "取り込む Postgres の database 名"
  type        = string
}

variable "rds_username" {
  description = "ClickPipes が Postgres に繋ぐユーザー名"
  type        = string
}

variable "rds_password" {
  description = "ClickPipes が Postgres に繋ぐパスワード。app secret の DB_PASSWORD を ephemeral resource で読んで渡す (password_wo 経由のため tfstate には残らない)"
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "rds_password_version" {
  description = "パスワード更新トリガー。RDS のパスワードを変えたら +1 して apply する (module.rds の master_password_version と揃える)"
  type        = number
  default     = 1
}

# =============================================================================
# ClickPipe
# =============================================================================

variable "tables" {
  description = "CDC の対象テーブル (public スキーマ)。ClickHouse 側のテーブル名も同じにする"
  type        = list(string)
}

variable "destination_database" {
  description = "取り込んだテーブルを置く ClickHouse の database"
  type        = string
  default     = "pg_cdc"
}

variable "sync_interval_seconds" {
  description = "Postgres から取り込む間隔 (秒)"
  type        = number
  default     = 60
}

/**
 * ClickPipes の固定 IP (ap-northeast-1、2026-04-15 以降に作ったサービス)。
 * provider から取れないため一覧で持つ。変わったらここを更新して apply する。
 * https://clickhouse.com/docs/integrations/clickpipes/networking/static-ips
 */
variable "clickpipes_egress_cidrs" {
  description = "bastion への SSH を許す送信元 (ClickPipes の固定 IP)"
  type        = list(string)
  default = [
    "54.168.88.92/32", "35.76.97.79/32", "54.64.100.89/32",
    "54.178.40.17/32", "52.195.101.208/32", "13.193.109.245/32",
  ]
}

variable "tags" {
  type    = map(string)
  default = {}
}
