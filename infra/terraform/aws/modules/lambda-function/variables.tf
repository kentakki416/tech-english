variable "name" {
  description = "Lambda 関数名 (例: project-template-min-api)"
  type        = string
}

variable "image_uri" {
  description = "関数の作成時だけ使うイメージ URI。以降は deploy workflow が更新する (ignore_changes)"
  type        = string
}

variable "memory_size" {
  description = "メモリ (MB)。CPU はメモリに比例して割り当てられる"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "タイムアウト (秒)"
  type        = number
  default     = 30
}

variable "reserved_concurrent_executions" {
  description = "同時実行数の上限 (予約)。null なら予約しない (アカウントの上限まで並ぶ)"
  type        = number
  default     = null
}

variable "log_retention_in_days" {
  description = "CloudWatch Logs 保持日数"
  type        = number
  default     = 3
}

variable "tags" {
  type    = map(string)
  default = {}
}
