# step3-infra-cdc

dev / prd の Terraform に `enable_cdc` を足し、`true` の環境にだけ ClickPipes（Postgres CDC）と、そのための SSH bastion を作る。RDS の論理レプリケーションは `enable_cdc` に関係なく有効にする。あわせて、CDC 対象テーブルの追加・削除・再同期の手順をまとめる。

min は CDC を MVP 対象外にする（`enable_cdc` を足さない。[`../deferred-cdc-operations.md`](../deferred-cdc-operations.md)）。

**既定値はどちらも `false`（仕組みだけを用意する）。既定値の plan に出るのは RDS のパラメータグループだけ。** パラメータグループの適用には RDS の再起動が 1 回要る（手順は後述）。

設計: [`../README.md`](../README.md#cdcclickpipes) / [変更のケースごとの作業](../README.md#変更のケースごとの作業)

前提: [step2-infra-data-warehouse-flag](./step2-infra-data-warehouse-flag.md)

## 対応内容

### `env/{dev,prd}/variables.tf`

```hcl
variable "enable_cdc" {
  description = "Postgres（RDS）から ClickHouse への CDC（ClickPipes + SSH bastion）を作るか。enable_data_warehouse = true のときだけ有効にできる。ClickPipes の CDC 用の計算資源（約 $73/月）と bastion（月 $10 未満）の固定費がかかる"
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_cdc || var.enable_data_warehouse
    error_message = "enable_cdc = true には enable_data_warehouse = true が要る"
  }
}
```

### `modules/rds`（変数の追加）

```hcl
variable "parameters" {
  description = "DB パラメータグループに設定するパラメータ。空ならパラメータグループを作らず AWS の既定を使う"
  type = list(object({
    name         = string
    value        = string
    apply_method = optional(string, "pending-reboot")
  }))
  default = []
}

variable "parameter_group_family" {
  type    = string
  default = "postgres16"
}
```

- `parameters` が空でなければ `aws_db_parameter_group` を作り、`aws_db_instance.parameter_group_name` に渡す。空なら null（既存の挙動）
- `family` を変えると作り直しになり、使用中のパラメータグループは消せない。`create_before_destroy` で付け替えてから消すため、名前は `name_prefix`（`${var.name}-params-`）にする
- `engine_version` のメジャーを上げるときは `parameter_group_family` も変える必要がある旨を description に書く

`env/{dev,prd}/main.tf` の `module "rds"`:

```hcl
/**
 * CDC（ClickPipes）用に論理レプリケーションを常に有効にする。
 * enable_cdc に連動させると「apply → 再起動 → もう一度 apply」の 2 段になるため、
 * 再起動が要るのはこのパラメータグループを入れるときの 1 回だけにする。
 * slot が無い間は WAL を溜め込まないので、常に有効でも WAL が少し増える程度。
 */
parameters = [
  { name = "rds.logical_replication", value = "1" },
  /**
   * slot が保持できる WAL の上限（MB）。ClickPipe が止まったまま WAL が溜まり続けて
   * ディスクが埋まるのを防ぐ。超えると slot が無効になり CDC は止まるが、DB は止まらない
   */
  { name = "max_slot_wal_keep_size", value = "5120", apply_method = "immediate" },
]
```

### `modules/clickpipes-postgres-cdc`（新規）

ClickPipe と、それが RDS に届くための SSH bastion をまとめて持つ（鍵・bastion・ClickPipe は互いに参照し合うので 1 つの module に閉じる）。

| 変数 | 内容 |
| --- | --- |
| `name` | 例: `tech-english-dev` |
| `service_id` | `module.clickhouse[0].service_id` |
| `vpc_id` / `public_subnet_id` | bastion の置き場所 |
| `rds_security_group_id` / `rds_address` / `rds_port` / `rds_database` / `rds_username` | 取り込み元 |
| `rds_password` | `sensitive` + `ephemeral`。app secret の `DB_PASSWORD` を ephemeral で読んで渡す（`module.rds` と同じ） |
| `rds_password_version` | `password_wo_version`。env 側の `local.db_password_version` を `module.rds` の `master_password_version` と共有する（片方だけ上げると ClickPipe が古いパスワードのまま認証に失敗する） |
| `tables` | CDC 対象のテーブル名の一覧 |
| `destination_database` | 既定 `pg_cdc` |
| `sync_interval_seconds` | 既定 `60` |
| `clickpipes_egress_cidrs` | 既定は `ap-northeast-1` の 6 個（下記） |
| `tags` | |

```hcl
/**
 * ClickPipes の固定 IP（ap-northeast-1、2026-04-15 以降に作ったサービス）。
 * provider から取れないため一覧で持つ。変わったらここを更新して apply する。
 * https://clickhouse.com/docs/integrations/clickpipes/networking/static-ips
 */
variable "clickpipes_egress_cidrs" {
  type = list(string)
  default = [
    "54.168.88.92/32", "35.76.97.79/32", "54.64.100.89/32",
    "54.178.40.17/32", "52.195.101.208/32", "13.193.109.245/32",
  ]
}
```

`main.tf` の構成（provider の検証済みの例を元にする）:

```hcl
/** 鍵の接続先に bastion の IP が要り、bastion の user_data に公開鍵が要るため、EIP を先に作って循環を切る */
resource "aws_eip" "bastion" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "${var.name}-cdc-bastion" })
}

/** 鍵ペアは ClickHouse Cloud が作り、秘密鍵は外に出ない。全属性が変更不可で、変えると作り直し */
resource "clickhouse_clickpipes_ssh_key" "bastion" {
  service_id = var.service_id
  name       = "${var.name}-cdc-bastion"
  host       = aws_eip.bastion.public_ip
  port       = 22
  username   = "clickpipes"
}

resource "aws_security_group" "bastion" { ... }   # Name: ${var.name}-cdc-bastion

/** ClickPipes の固定 IP からだけ SSH を受ける */
resource "aws_security_group_rule" "bastion_ssh_from_clickpipes" {
  type              = "ingress"
  security_group_id = aws_security_group.bastion.id
  cidr_blocks       = var.clickpipes_egress_cidrs
  protocol          = "tcp"
  from_port         = 22
  to_port           = 22
}

/** bastion からは RDS の 5432 にだけ出る */
resource "aws_security_group_rule" "bastion_to_rds" { type = "egress", source_security_group_id = var.rds_security_group_id, ... }

/** RDS 側で bastion からの 5432 を受ける（modules/vpc と同じ aws_security_group_rule を使う） */
resource "aws_security_group_rule" "rds_from_bastion" { type = "ingress", security_group_id = var.rds_security_group_id, ... }

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ssm_parameter.al2023_arm64.insecure_value
  instance_type               = "t4g.nano"
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [aws_security_group.bastion.id]
  associate_public_ip_address = false
  user_data_replace_on_change = true
  user_data                   = <cloud-init（下記）>

  metadata_options { http_tokens = "required" }
  root_block_device { encrypted = true }

  /** AMI の更新で作り直さない（作り直すと IP は EIP で保たれるが、ClickPipe が一時的に繋がらなくなる） */
  lifecycle { ignore_changes = [ami] }
}

resource "aws_eip_association" "bastion" { ... }

/** cloud-init が終わってから ClickPipe を作る */
resource "time_sleep" "bastion_boot" {
  depends_on      = [aws_eip_association.bastion]
  create_duration = "90s"
  triggers        = { instance_id = aws_instance.bastion.id }
}

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

  destination = { database = var.destination_database }

  depends_on = [time_sleep.bastion_boot, aws_security_group_rule.bastion_ssh_from_clickpipes, ...]
}
```

- **属性は nested attribute の書き方（`source = { postgres = { ... } }`）にする。** clickhouse.com のページのブロック記法は現行の schema と合わない
- `trigger_resync` は使わない（設定に残すと apply のたびに再同期する）
- outputs: `clickpipe_state`（`clickhouse_clickpipe.this.state`）/ `ssh_key_status` / `bastion_public_ip`

bastion の cloud-init:

```yaml
#cloud-config
users:
  - default
  - name: clickpipes
    lock_passwd: true
    shell: /sbin/nologin
    ssh_authorized_keys:
      - ${public_key}
write_files:
  - path: /etc/ssh/sshd_config.d/90-clickpipes.conf
    content: |
      Match User clickpipes
        AllowTcpForwarding local
        PermitOpen ${rds_address}:${rds_port}
        PermitTTY no
        X11Forwarding no
        AllowAgentForwarding no
runcmd:
  - systemctl reload sshd
```

- シェルを `/sbin/nologin` にしてもポートフォワードはできる想定。ClickPipes がセッションを開く実装でトンネルが張れない場合は、`shell` を外して `ForceCommand` も付けない形に戻す（動作確認で確かめる）
- `default`（`ec2-user`）は鍵を登録しないのでログインできない。調査が要るときは Session Manager を使う（MVP では SSM エージェントの権限は付けない。必要になったら instance profile を足す）

### `env/{dev,prd}/main.tf`

```hcl
module "cdc" {
  source = "../../modules/clickpipes-postgres-cdc"
  count  = var.enable_cdc ? 1 : 0

  name                  = local.name_prefix
  service_id            = module.clickhouse[0].service_id
  vpc_id                = module.vpc.vpc_id
  public_subnet_id      = module.vpc.subnets[local.public_subnet_keys[0]].id
  rds_security_group_id = module.vpc.security_groups["rds"].id
  rds_address           = module.rds.address
  rds_port              = module.rds.port
  rds_database          = module.rds.db_name
  rds_username          = module.rds.master_username
  rds_password          = jsondecode(ephemeral.aws_secretsmanager_secret_version.app.secret_string)["DB_PASSWORD"]
  rds_password_version  = local.db_password_version # module.rds の master_password_version と同じ local

  /** CDC 対象の一覧の正本。ローカルの migration コマンドも同じファイルを読む */
  tables = jsondecode(file("${path.module}/../../../../clickhouse/cdc-tables.json"))

  tags = local.common_tags
}
```

- `module "ecs_dwh_migration"` の `DATA_WAREHOUSE_CDC` を `var.enable_cdc ? "clickpipes" : "none"` にする
- `provider.tf` に `hashicorp/time`（`~> 0.13`）を足し、`.terraform.lock.hcl` を更新する
- `outputs.tf` に `clickpipe_state`（`one(module.cdc[*].clickpipe_state)`）を足す
- trivy（CRITICAL / HIGH / MEDIUM）に指摘が出たときだけ、意図したものを理由のコメント付きで `.trivyignore` に足す（実装時点では指摘なし）

### Terraform CI

`terraform-aws-env-ci.yml` の `paths` に `infra/clickhouse/cdc-tables.json` を足す（Terraform が読むため、変更時に validate / plan を走らせる）。

### 手順書（`packages/data-warehouse/clickhouse/README.md` に書く）

**パラメータグループを入れたとき（1 回だけ）**

1. apply（dev / prd）
2. `aws rds reboot-db-instance --db-instance-identifier <prefix>-db`（dev は日中でよい。prd はメンテナンス時間帯に）
3. `aws rds describe-db-instances` の `DBParameterGroups[].ParameterApplyStatus` が `in-sync` になったことを確認する

**CDC を有効にする**

1. `enable_cdc` の既定値を `true` にして PR → マージ → apply
2. ClickHouse Cloud のコンソールで SSH の鍵を検証（Validate）し、`active` になることを確かめる（検証は自動では走らない）
3. apply の出力の `clickpipe_state` が `Running` か `Snapshot` であること（`Failed` でも apply は成功するため必ず見る）
4. deploy（または `clickhouse-migrate.yml`）で view を作る

**新しく作る環境で有効にするとき**: 最初の deploy（Drizzle の migration でテーブルを作る）が終わってから `enable_cdc` を `true` にする。先に作られて `Failed` になったら、準備ができてから `terraform apply -replace='module.cdc[0].clickhouse_clickpipe.this'` で作り直す（差分の無い apply では動き出さない）

**bastion の OS の更新**: AMI を固定し、外へは RDS にしか出られないので、定期的に、または sshd に脆弱性が出たら `terraform apply -replace='module.cdc[0].aws_instance.bastion'` で作り直す

**ケース 1（CDC 対象のテーブルを足す）**: Drizzle の migration・`cdc-tables.json`・`views/<table>.sql` を 1 つの PR に入れる → マージ → deploy（テーブル作成。view は skip）→ apply（ClickPipe に追加。初回の取り込み）→ `clickhouse-migrate.yml`（view 作成）

**ケース 2（テーブルを消す・名前を変える）**

1. 1 回目の PR: `cdc-tables.json` から外し、`views/<table>.sql` を消し、`DROP VIEW IF EXISTS v_<table>` の migration を足す → deploy → apply（ClickPipe から外す）
2. 2 回目の PR: Drizzle の変更と、`DROP TABLE IF EXISTS pg_cdc.<table>` の migration を足す → deploy。名前変更なら、新しい名前でケース 1 も同じ PR で行う（apply → `clickhouse-migrate.yml` が続く）

**ケース 4（型・列名の変更）**: deploy（Drizzle）→ ClickHouse Cloud のコンソールで ClickPipe を Resync → 完了後に `clickhouse-migrate.yml`

**CDC を無効にする**: `enable_cdc` を `false` にして apply（ClickPipe・bastion が消える）。`pg_cdc` のテーブルと view は残るので、不要なら migration で消す。replication slot が消えたことは CloudWatch の `OldestReplicationSlotLag` で確かめる（RDS に SQL を流す手段は用意していない）。残っても `max_slot_wal_keep_size` を超えると無効になり、WAL は解放される

## 動作確認

dev で確認する（`enable_data_warehouse = true` の状態から）。

### パラメータグループ

- 既定値のままの plan で、RDS にはパラメータグループの追加だけが出る（`replace` が出ないこと）
- 再起動後に `aws rds describe-db-instances` の `ParameterApplyStatus` が `in-sync`（RDS に SQL を流す手段は用意していない）

### `enable_cdc = true`

- apply で bastion・SSH の鍵・ClickPipe ができる。`clickpipe_state` が `Running` / `Snapshot`
- ClickHouse Cloud のコンソールで、SSH の鍵が `active`、ClickPipe に users / memos がある
- `pg_cdc.users` / `pg_cdc.memos` ができ、件数が RDS と一致する（`pg_cdc` が作られない場合は README のリスク表のとおり `default` に切り替える）
- bastion に ClickPipes の固定 IP 以外から SSH できない（手元から `ssh -o ConnectTimeout=5 clickpipes@<EIP>` がタイムアウトする）
- CloudWatch の RDS のメトリクス `OldestReplicationSlotLag` が出る（ClickPipes の slot がある）
- SSH の鍵はコンソールで検証（Validate）するまで `pending` のまま。`pending` のままでも ClickPipe が繋がるかを確かめる

### ケースの確認

step4 の動作確認でまとめて行う（deploy への組み込みが要るため）。

### 無効化

- `enable_cdc = false` で apply → ClickPipe・bastion・SSH の鍵が消え、RDS の replication slot も消えている。消えていなければ `SELECT pg_drop_replication_slot('<slot>')` で消す手順を README に足す
