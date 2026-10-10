output "secret_arn" {
  description = "Secret ARN (ECS task definition の valueFrom で参照)"
  value       = aws_secretsmanager_secret.this.arn
}

output "secret_name" {
  description = "Secret 名"
  value       = aws_secretsmanager_secret.this.name
}

output "seeded_secret_id" {
  description = "初期値投入済みの Secret ID。ephemeral な読み出し側はこちらを参照することで、新規環境の初回 apply でも initial_values 投入後に読まれることが保証される"
  value       = aws_secretsmanager_secret_version.this.secret_id
}
