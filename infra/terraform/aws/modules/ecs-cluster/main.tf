# =============================================================================
# ECS Fargate Cluster
# =============================================================================

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = var.container_insights_enabled ? "enabled" : "disabled"
  }

  tags = var.tags
}

# capacity provider で起動する workload (Fargate Spot 等) がある cluster だけ関連付ける。
# 空 (既定) なら作らないので、launch_type = FARGATE だけの cluster には差分が出ない。
resource "aws_ecs_cluster_capacity_providers" "this" {
  count = length(var.capacity_providers) > 0 ? 1 : 0

  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = var.capacity_providers
}

# =============================================================================
# Task Execution Role (cluster 共通)
# =============================================================================
# 全 workload (API / worker / migration / 将来追加) が共有する。
# ECR pull / CloudWatch Logs / 後から env 側で追加 attach する Secrets Manager 等を担う。

data "aws_iam_policy" "ecs_task_execution" {
  name = "AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name}-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.task_execution_trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = data.aws_iam_policy.ecs_task_execution.arn
}

# Secrets Manager GetSecretValue 権限 (workload で override する想定がないため cluster で一元管理)
# 一覧は secret_arns_readable で env 側から渡す
data "aws_iam_policy_document" "secrets_access" {
  count = length(var.secret_arns_readable) > 0 ? 1 : 0

  statement {
    sid       = "ReadWorkloadSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns_readable
  }
}

resource "aws_iam_role_policy" "secrets_access" {
  count = length(var.secret_arns_readable) > 0 ? 1 : 0

  name   = "${var.name}-secrets-access"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.secrets_access[0].json
}
