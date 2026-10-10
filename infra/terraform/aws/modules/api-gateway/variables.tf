variable "name" {
  description = "HTTP API 名 (例: project-template-min-api)"
  type        = string
}

variable "domain_name" {
  description = "独自ドメインの FQDN (例: api.project-template.com)"
  type        = string
}

variable "certificate_arn" {
  description = "独自ドメインに付ける ACM 証明書の ARN (API Gateway と同じリージョン)"
  type        = string
}

variable "lambda_function_name" {
  description = "統合先の Lambda 関数名 (invoke 権限の付与に使う)"
  type        = string
}

variable "lambda_alias_name" {
  description = "統合先の Lambda alias 名 (live)"
  type        = string
}

variable "lambda_alias_invoke_arn" {
  description = "統合先の Lambda alias の invoke ARN"
  type        = string
}

variable "throttling_burst_limit" {
  description = "ステージ全体のバースト上限 (リクエスト数)"
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "ステージ全体の 1 秒あたりのリクエスト上限"
  type        = number
  default     = 50
}

variable "log_retention_in_days" {
  description = "アクセスログ (CloudWatch Logs) の保持日数"
  type        = number
  default     = 3
}

variable "tags" {
  type    = map(string)
  default = {}
}
