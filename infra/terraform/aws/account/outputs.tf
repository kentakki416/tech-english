# =============================================================================
# Account-scoped Outputs
# =============================================================================

# ECR
output "ecr_api_repository_url" {
  description = "API (project-template-api-server) の ECR リポジトリ URL"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_repository_url" {
  description = "worker の ECR リポジトリ URL"
  value       = aws_ecr_repository.worker.repository_url
}

output "ecr_migration_repository_url" {
  description = "DB migration 用 ECR リポジトリ URL"
  value       = aws_ecr_repository.migration.repository_url
}

output "ecr_cron_repository_url" {
  description = "cron (定期実行タスク) 用 ECR リポジトリ URL"
  value       = aws_ecr_repository.cron.repository_url
}

# GitHub Actions OIDC
output "github_actions_dev_role_arn" {
  description = "GitHub Actions dev 環境用 IAM ロールの ARN (GitHub Environments の dev → AWS_ROLE_ARN に登録)"
  value       = aws_iam_role.github_actions_dev.arn
}

output "github_actions_prd_role_arn" {
  description = "GitHub Actions prd 環境用 IAM ロールの ARN (GitHub Environments の prd → AWS_ROLE_ARN に登録)"
  value       = aws_iam_role.github_actions_prd.arn
}

output "github_actions_min_role_arn" {
  description = "GitHub Actions min 環境の deploy 用 IAM ロールの ARN (GitHub Environments の min → AWS_ROLE_ARN に登録)"
  value       = aws_iam_role.github_actions_min.arn
}

output "github_actions_min_terraform_role_arn" {
  description = "GitHub Actions min 環境の terraform 用 IAM ロールの ARN (GitHub Environments の min-terraform → AWS_ROLE_ARN に登録)"
  value       = aws_iam_role.github_actions_min_terraform.arn
}
