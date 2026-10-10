resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

# RDS インスタンス本体。
# - master password は app secret (例: /project-template-prd/app) の DB_PASSWORD を唯一の情報源とし、
#   env 層が ephemeral resource で読んで var.master_password (ephemeral) として渡す。
#   password_wo (write-only 引数) で AWS に送るだけなので tfstate に平文は残らない。
# - 以前は manage_master_user_password=true で AWS 管理 (rds!... secret) にしていたが、
#   デフォルトで 7 日周期の自動ローテーションが有効になり、ECS タスクが読む app secret の
#   DATABASE_URL と乖離して DB 認証エラーを起こす (派生 repo typing-royale の 2026-07-04
#   prd デプロイ障害)。パスワードの置き場所を app secret に一本化するため廃止した。
# - パスワードを変更する手順: app secret の DB_PASSWORD と DATABASE_URL を両方更新
#   → var.master_password_version を +1 して apply → ECS 再デプロイ。
# - publicly_accessible=false で internet 直アクセス遮断、isolated subnet 配置と二重防御。
# - storage_encrypted=true で at-rest 暗号化 (AWS-managed KMS key)。
resource "aws_db_instance" "this" {
  identifier = var.name

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.master_username

  password_wo         = var.master_password
  password_wo_version = var.master_password_version

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  publicly_accessible    = false

  multi_az                = var.multi_az
  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window

  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_retention_period

  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot

  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  apply_immediately          = var.apply_immediately

  tags = var.tags
}
