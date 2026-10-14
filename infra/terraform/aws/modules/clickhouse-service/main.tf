/**
 * default ユーザーのパスワード。意図せず再生成されないよう ignore_changes でガードする。
 * 変えるときは `terraform apply -replace='module.clickhouse[0].random_password.default_user'` と
 * env 側の password_version の +1 を同じ apply で行い、その後 worker を deploy し直す
 * (稼働中の worker は起動時に読んだ古いパスワードを持ち続けるため)
 */
resource "random_password" "default_user" {
  length  = 32
  special = false

  lifecycle {
    ignore_changes = [length, special, override_special, min_lower, min_upper, min_numeric, min_special]
  }
}

resource "clickhouse_service" "this" {
  name           = var.name
  cloud_provider = "aws"
  region         = var.region

  /**
   * Basic tier を前提にする。tier は新しい tier の organization では指定してはいけない。
   * メモリは provider が必須にしているので、Basic の固定値 (8 GB) に合わせる
   */
  min_replica_memory_gb = 8
  max_replica_memory_gb = 8

  idle_scaling         = true
  idle_timeout_minutes = 15

  ip_access = [for cidr in var.ip_access_cidrs : { source = cidr, description = "${var.name} allowed" }]

  password_wo         = random_password.default_user.result
  password_wo_version = var.password_version

  lifecycle {
    precondition {
      condition     = var.credentials_configured
      error_message = "enable_data_warehouse = true には clickhouse_org_id / clickhouse_token_key / clickhouse_token_secret が要る (GitHub Environment の secret の CLICKHOUSE_*)"
    }
  }
}

/**
 * deploy workflow はこの secret の有無で ClickHouse の migration を流すかを判定する。
 * - サービスを作り終えてから作る。サービスの作成に失敗したときに secret だけが残ると、判定が true になるため
 * - 削除待ちの secret も describe-secret では見えるため、recovery_window_in_days = 0 で即座に消す
 */
resource "aws_secretsmanager_secret" "this" {
  name                    = var.secret_name
  description             = "ClickHouse Cloud connection for ${var.name}"
  recovery_window_in_days = 0

  tags = var.tags

  depends_on = [clickhouse_service.this]
}

locals {
  /** worker と migration に環境変数として渡す接続情報。キーは ecs_secrets の output と共有する */
  connection = {
    DATA_WAREHOUSE_DATABASE = var.database
    DATA_WAREHOUSE_PASSWORD = random_password.default_user.result
    DATA_WAREHOUSE_URL      = "https://${clickhouse_service.this.endpoints.https.host}:${clickhouse_service.this.endpoints.https.port}"
    DATA_WAREHOUSE_USER     = "default"
  }
}

/**
 * app secret と違い ignore_changes を付けない。値はすべて Terraform が作ったリソースから決まるため、
 * サービスを作り直したときに接続先が追随するようにする。
 */
resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode(local.connection)
}
