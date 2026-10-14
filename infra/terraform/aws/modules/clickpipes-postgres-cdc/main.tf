# =============================================================================
# SSH bastion
# =============================================================================
# ClickPipes は VPC の外から RDS に繋ぐため、SSH トンネルの踏み台を public subnet に置く。
# - SSH は ClickPipes の固定 IP からだけ受け、bastion からは RDS の 5432 にだけ出る
# - ログインできるのは ClickPipes の鍵を持つ clickpipes ユーザーだけで、RDS へのポートフォワード以外はできない
# 設計: docs/spec/clickhouse-migration/README.md

/** 鍵の接続先に bastion の IP が要り、bastion の user_data に公開鍵が要るため、EIP を先に作って循環を切る */
resource "aws_eip" "bastion" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-cdc-bastion" })
}

/** 鍵ペアは ClickHouse Cloud が作り、秘密鍵は外に出ない。全属性が変更不可で、変えると作り直しになる */
resource "clickhouse_clickpipes_ssh_key" "bastion" {
  service_id = var.service_id
  name       = "${var.name}-cdc-bastion"
  host       = aws_eip.bastion.public_ip
  port       = 22
  username   = "clickpipes"
}

resource "aws_security_group" "bastion" {
  name        = "${var.name}-cdc-bastion"
  description = "SSH bastion for ClickPipes Postgres CDC"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-cdc-bastion" })
}

resource "aws_security_group_rule" "bastion_ssh_from_clickpipes" {
  type              = "ingress"
  security_group_id = aws_security_group.bastion.id
  cidr_blocks       = var.clickpipes_egress_cidrs
  protocol          = "tcp"
  from_port         = 22
  to_port           = 22
  description       = "SSH from ClickPipes static IPs"
}

resource "aws_security_group_rule" "bastion_to_rds" {
  type                     = "egress"
  security_group_id        = aws_security_group.bastion.id
  source_security_group_id = var.rds_security_group_id
  protocol                 = "tcp"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  description              = "Postgres to RDS"
}

resource "aws_security_group_rule" "rds_from_bastion" {
  type                     = "ingress"
  security_group_id        = var.rds_security_group_id
  source_security_group_id = aws_security_group.bastion.id
  protocol                 = "tcp"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  description              = "Postgres from ClickPipes bastion"
}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ssm_parameter.al2023_arm64.insecure_value
  instance_type               = "t4g.nano"
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = false

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    public_key  = clickhouse_clickpipes_ssh_key.bastion.public_key
    rds_address = var.rds_address
    rds_port    = var.rds_port
  })
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    encrypted = true
  }

  tags = merge(var.tags, { Name = "${var.name}-cdc-bastion" })

  /** AMI の更新で作り直さない (作り直すと IP は EIP で保たれるが、ClickPipe が一時的に繋がらなくなる) */
  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip_association" "bastion" {
  allocation_id = aws_eip.bastion.id
  instance_id   = aws_instance.bastion.id
}

/** cloud-init が clickpipes ユーザーを作り終えてから ClickPipe を作る */
resource "time_sleep" "bastion_boot" {
  create_duration = "90s"
  triggers = {
    instance_id = aws_instance.bastion.id
  }

  depends_on = [aws_eip_association.bastion]
}

# =============================================================================
# ClickPipe (Postgres CDC)
# =============================================================================

resource "clickhouse_clickpipe" "this" {
  name       = "${var.name}-postgres-cdc"
  service_id = var.service_id

  source = {
    postgres = {
      type                = "rdspostgres"
      host                = var.rds_address
      port                = var.rds_port
      database            = var.rds_database
      ssh_key_resource_id = clickhouse_clickpipes_ssh_key.bastion.id

      credentials = {
        username            = var.rds_username
        password_wo         = var.rds_password
        password_wo_version = var.rds_password_version
      }

      /** publication と replication slot は ClickPipes が作る */
      settings = {
        replication_mode      = "cdc"
        sync_interval_seconds = var.sync_interval_seconds
      }

      table_mappings = [
        for t in var.tables : { source_schema_name = "public", source_table = t, target_table = t }
      ]
    }
  }

  destination = {
    database = var.destination_database
  }

  /** trigger_resync は使わない (設定に残すと apply のたびに再同期する)。再同期はコンソールから行う */

  depends_on = [
    aws_security_group_rule.bastion_ssh_from_clickpipes,
    aws_security_group_rule.bastion_to_rds,
    aws_security_group_rule.rds_from_bastion,
    time_sleep.bastion_boot,
  ]
}
