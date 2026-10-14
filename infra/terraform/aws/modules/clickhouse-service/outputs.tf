output "service_id" {
  description = "ClickHouse Cloud のサービス ID"
  value       = clickhouse_service.this.id
}

output "secret_arn" {
  description = "接続情報 (DATA_WAREHOUSE_*) の secret の ARN。ECS task definition の valueFrom で個別キーを引く"
  value       = aws_secretsmanager_secret.this.arn

  /** 値が入る前に worker や migration のタスク定義が参照しないよう、サービスの作成と値の書き込みを待たせる */
  depends_on = [aws_secretsmanager_secret_version.this]
}

output "ecs_secrets" {
  description = "ECS task definition の secrets に渡す map (環境変数名 → valueFrom)。ecs-workload の additional_secrets にそのまま渡す"
  value       = { for k in keys(local.connection) : k => "${aws_secretsmanager_secret.this.arn}:${k}::" }

  /** 値が入る前に worker や migration のタスク定義が参照しないよう、サービスの作成と値の書き込みを待たせる */
  depends_on = [aws_secretsmanager_secret_version.this]
}

output "https_host" {
  description = "サービスの HTTPS エンドポイントのホスト名"
  value       = clickhouse_service.this.endpoints.https.host
}
