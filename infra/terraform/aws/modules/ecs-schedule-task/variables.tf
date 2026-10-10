# =============================================================================
# 必須パラメータ
# =============================================================================

variable "name" {
  description = "schedule / IAM role 名のベース (例: project-template-dev-cron)"
  type        = string
}

variable "cluster_arn" {
  description = "RunTask を実行する ECS cluster の ARN"
  type        = string
}

variable "task_definition_family" {
  description = "起動する task definition の family 名。revision を含めないことで実行時に常に最新 ACTIVE revision が起動される (CI が deploy 毎に新 revision を register する運用前提。modules/ecs-workload の task_definition_family 出力を渡す)"
  type        = string
}

variable "execution_role_arn" {
  description = "task の execution role ARN。scheduler が RunTask する際に PassRole する対象"
  type        = string
}

variable "subnets" {
  description = "task を配置する subnet ID のリスト"
  type        = list(string)
}

variable "security_groups" {
  description = "task に付与する Security Group ID のリスト"
  type        = list(string)
}

variable "schedule_expression" {
  description = "起動スケジュール (cron() または rate() 式)。例: cron(0 4 * * ? *) / rate(1 day)"
  type        = string
}

# =============================================================================
# 任意パラメータ
# =============================================================================

variable "task_role_arn" {
  description = "task role ARN。null なら execution_role_arn と同じ (PassRole 対象に含める)"
  type        = string
  default     = null
}

variable "assign_public_ip" {
  description = "task に public IP を付与するか (private subnet 配置なら false)"
  type        = bool
  default     = false
}

variable "schedule_expression_timezone" {
  description = "schedule_expression を解釈するタイムゾーン (IANA 名)"
  type        = string
  default     = "Asia/Tokyo"
}

variable "state" {
  description = "ENABLED / DISABLED。DISABLED にすると schedule は起動しない"
  type        = string
  default     = "ENABLED"

  validation {
    condition     = contains(["ENABLED", "DISABLED"], var.state)
    error_message = "state は ENABLED か DISABLED を指定してください。"
  }
}

variable "launch_type" {
  description = "RunTask の launch type"
  type        = string
  default     = "FARGATE"
}

variable "platform_version" {
  description = "Fargate platform version。null なら LATEST"
  type        = string
  default     = null
}

variable "task_count" {
  description = "1 回の起動で作成する task 数"
  type        = number
  default     = 1
}

variable "tags" {
  type    = map(string)
  default = {}
}
