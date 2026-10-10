data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  task_role_arn = var.task_role_arn != null ? var.task_role_arn : var.execution_role_arn

  /**
   * ecs:RunTask の対象となる task definition ARN。
   * family の全 revision を許可するため revision 部分を wildcard にする
   * (実行時に最新 ACTIVE revision が選ばれる)。
   */
  task_definition_arn_wildcard = "arn:aws:ecs:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:task-definition/${var.task_definition_family}:*"
}

# =============================================================================
# EventBridge Scheduler 実行ロール (scheduler が ECS RunTask を呼ぶため)
# =============================================================================

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    /**
     * confused deputy 対策: 自アカウントの scheduler からの assume のみ許可
     */
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json

  tags = var.tags
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "RunScheduledTask"
    effect    = "Allow"
    actions   = ["ecs:RunTask"]
    resources = [local.task_definition_arn_wildcard]

    condition {
      test     = "ArnLike"
      variable = "ecs:cluster"
      values   = [var.cluster_arn]
    }
  }

  /**
   * RunTask 時に task の execution role / task role を ECS へ渡すため
   */
  statement {
    sid       = "PassTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = distinct([var.execution_role_arn, local.task_role_arn])
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "run-task"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# =============================================================================
# EventBridge Scheduler スケジュール (ECS RunTask ターゲット)
# =============================================================================
# - ecs_parameters.task_definition_arn に family 名を渡し、実行時に最新 ACTIVE
#   revision を起動する。CI が deploy 毎に新 revision を register することで
#   image が更新され、schedule 側は再 apply 不要で最新を追従する。

resource "aws_scheduler_schedule" "this" {
  name        = var.name
  state       = var.state
  description = "Scheduled ECS task: ${var.name}"

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.schedule_expression_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = var.task_definition_family
      task_count          = var.task_count
      launch_type         = var.launch_type
      platform_version    = var.platform_version

      network_configuration {
        subnets          = var.subnets
        security_groups  = var.security_groups
        assign_public_ip = var.assign_public_ip
      }
    }
  }
}
