variable "name" {
  description = "ClickHouse Cloud のサービス名 (例: tech-english-dev)"
  type        = string
}

variable "region" {
  description = "サービスを置く AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "ip_access_cidrs" {
  description = "サービスへの接続を許す送信元 CIDR のリスト (worker / migration のタスクが外へ出る IP と、分析ツールなどの IP)"
  type        = list(string)
}

variable "database" {
  description = "migration と worker が使う database 名。DATA_WAREHOUSE_DATABASE として secret に入れる"
  type        = string
  default     = "tech_english"
}

variable "secret_name" {
  description = "接続情報 (DATA_WAREHOUSE_*) を入れる Secrets Manager の secret 名 (例: /tech-english-dev/data-warehouse)"
  type        = string
}

variable "password_version" {
  description = "default ユーザーのパスワードの版。random_password を -replace で作り直すときに同じ apply で +1 する (password_wo は値の変化を検知できないため。手順は main.tf)"
  type        = number
  default     = 1
}

variable "credentials_configured" {
  description = "ClickHouse Cloud の API の認証情報が渡されているか。false ならサービスを作る前に plan を止める"
  type        = bool
}

variable "tags" {
  type    = map(string)
  default = {}
}
