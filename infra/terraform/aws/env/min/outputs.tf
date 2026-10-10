# =============================================================================
# Outputs
# =============================================================================

# ネットワーク
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "パブリックサブネットIDのリスト (worker / cron / migration の ECS task 配置)"
  value       = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
}

output "ecs_security_group_id" {
  description = "ECS task に付与する SG の ID"
  value       = module.vpc.security_groups["ecs"].id
}

# API
output "api_url" {
  description = "API の HTTPS URL"
  value       = "https://${var.api_subdomain}.${var.domain_name}"
}

output "lambda_api_function_name" {
  description = "api の Lambda 関数名 (deploy workflow が更新する対象)"
  value       = module.lambda_api.function_name
}

# ECS
output "ecs_cluster_name" {
  description = "ECS cluster 名"
  value       = module.ecs_cluster.cluster_name
}

output "ecs_worker_service_name" {
  description = "worker ECS service 名 (enable_worker = false なら null)"
  value       = var.enable_worker ? module.ecs_worker[0].service_name : null
}

output "ecs_migration_task_definition_family" {
  description = "DB migration task definition family (RunTask 引数で使用)"
  value       = module.ecs_migration.task_definition_family
}

output "ecs_cron_task_definition_family" {
  description = "cron task definition family (deploy で新 revision を register する対象)"
  value       = module.ecs_cron.task_definition_family
}

# Secrets
output "app_secret_name" {
  description = "Application secret の名前"
  value       = module.app_secrets.secret_name
}
