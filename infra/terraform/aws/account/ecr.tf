# =============================================================================
# コンテナレジストリ設定 (ECR)
# =============================================================================

resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}-api-server"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-api-server"
    Project = var.project_name
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

/**
 * api の repository に Lambda サービスからの pull を許可する（minimal 構成の api は Lambda で動く）。
 * Lambda は関数の作成時に自分で repository policy を書き足すが、IaC の外で policy が
 * 変わるのを避けるため明示しておく。
 */
data "aws_iam_policy_document" "api_lambda_pull" {
  statement {
    sid     = "AllowLambdaPull"
    effect  = "Allow"
    actions = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "aws:sourceArn"
      values   = ["arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-*"]
    }
  }
}

resource "aws_ecr_repository_policy" "api_lambda_pull" {
  repository = aws_ecr_repository.api.name
  policy     = data.aws_iam_policy_document.api_lambda_pull.json
}

/**
 * worker (BullMQ ジョブ消化用) のコンテナイメージ用 ECR
 */
resource "aws_ecr_repository" "worker" {
  name                 = "${var.project_name}-worker"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-worker"
    Project = var.project_name
  }
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}

/**
 * DB migration (Drizzle) 専用コンテナイメージ用 ECR。
 * 本番 API イメージに drizzle-kit / devDependencies が混入するのを避けるため、
 * migration は独立した最小イメージ (packages/db/Dockerfile.migration) を別 ECR に push する。
 */
resource "aws_ecr_repository" "migration" {
  name                 = "${var.project_name}-migration"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-migration"
    Project = var.project_name
  }
}

resource "aws_ecr_lifecycle_policy" "migration" {
  repository = aws_ecr_repository.migration.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}

/**
 * cron (EventBridge Scheduler から定期実行する one-shot タスク用) のコンテナイメージ用 ECR
 */
resource "aws_ecr_repository" "cron" {
  name                 = "${var.project_name}-cron"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name    = "${var.project_name}-cron"
    Project = var.project_name
  }
}

resource "aws_ecr_lifecycle_policy" "cron" {
  repository = aws_ecr_repository.cron.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}
