variable "name" {
  description = "ECS cluster 名 (例: project-template-dev-cluster)"
  type        = string
}

variable "container_insights_enabled" {
  description = "CloudWatch Container Insights を有効化するか"
  type        = bool
  default     = true
}

variable "capacity_providers" {
  description = "cluster に関連付ける capacity provider (例: [\"FARGATE\", \"FARGATE_SPOT\"])。空なら関連付けない (launch_type で起動する workload だけの cluster)"
  type        = list(string)
  default     = []
}

variable "secret_arns_readable" {
  description = "Task execution role が secretsmanager:GetSecretValue で読み出せる Secrets Manager の ARN リスト。全 workload で共通の secret アクセス権を一元管理する"
  type        = list(string)
  default     = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
