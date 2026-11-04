# step7-infra-cron-schedules

`generate:questions` を本番で 1 日 1 回起動するよう、EventBridge Scheduler のスケジュールを 1 本足す。既存の cron の task definition を起動し、Scheduler の target の `input`（RunTask の `containerOverrides`）で command だけを差し替える。あわせて cron に `ANTHROPIC_API_KEY` の secret を足す。対象は `env/min`・`env/dev`・`env/prd` の 3 つ。

収集（`collect:passages`）は cron でやめ、admin の「今すぐ収集」で worker が 1 ソースずつ行う（[manual-collection](../../manual-collection/README.md)）。そのため収集のスケジュールは足さず、GitHub の token（`GITHUB_CONTENT_TOKEN`）は cron ではなく worker の `secret_keys` に入っている。

## 前提

- [step2-cron-llm-client](./step2-cron-llm-client.md)・[step3-cron-generate-questions](./step3-cron-generate-questions.md)：`dist/task/generate-questions.js`、`ANTHROPIC_API_KEY`・`GENERATION_MODEL` 等の env
- [minimal-deploy step3-infra-env-min](../../minimal-deploy/tasks/step3-infra-env-min.md)・[step4-ci-deploy-min](../../minimal-deploy/tasks/step4-ci-deploy-min.md)：`env/min` と `deploy-aws-min.yml` が構築済み
- 配置と起動の理由：[product-overview のインフラ上の配置](../../product-overview/README.md#インフラ上の配置)、[生成タスクの動き](../README.md#生成タスクの動き)、[minimal-deploy の cron と migration](../../minimal-deploy/README.md#cron-と-migration)・[secret と環境変数の注入](../../minimal-deploy/README.md#secret-と環境変数の注入)

## 対応内容

### 1. スケジュール

2 本とも同じ cron の task definition（family の最新 revision。CI が deploy ごとに register する）を起動する。

| スケジュール | command | 既定の時刻（Asia/Tokyo） | 既定の state |
| --- | --- | --- | --- |
| `<prefix>-generate-questions`（新規） | `["node", "dist/task/generate-questions.js"]` | `cron(0 4 * * ? *)` | min / prd は `ENABLED`、dev は `DISABLED` |
| `<prefix>-cron`（既存の `module "cron_schedule"`） | 上書きしない（`cleanup-old-memos`） | `cron(0 4 * * ? *)`（変えない） | 変えない |

- generate はその時点の `collected` を処理し、残りは翌日に回る（実行が重なっても `FOR UPDATE SKIP LOCKED` で同じ行を二重に処理しない）
- 既存の memo の cleanup はそのまま残す（`memos` を消すかは [product-overview](../../product-overview/README.md#実装の順番) で別途判断）。module 名を変えると schedule と IAM role が作り直しになるので触らない
- dev を `DISABLED` にするのは、Claude API の費用を本番と二重に出さないため。確認するときだけ `-var` か既定値の変更で `ENABLED` にする

### 2. cron に渡す env

1 つの task definition を全タスクで共有するので、secret は全タスク分の和集合になる。

| 変数 | 渡し方 | 理由 |
| --- | --- | --- |
| `DATABASE_URL`・`NODE_ENV` | secret（既存） | ― |
| `ANTHROPIC_API_KEY` | secret（追加） | generate が起動時に必須として検査する |
| `GENERATION_MODEL`・`VERIFICATION_MODEL`・`GENERATE_MAX_PASSAGES_PER_RUN`・`GENERATE_MAX_PENDING_DRAFTS` | 渡さない | env.ts に既定値がある。変えるときは `module "ecs_cron"` の `environment` に足す |

**`secret_keys` に足したキーが Secrets Manager に無いと、ECS はタスクの起動自体に失敗する（`ResourceInitializationError`）。cleanup も同じ task definition なので一緒に止まる。** そのため [7. 適用の順番](#7-適用の順番) の通り、seed を apply より先に行う。

### 3. `modules/ecs-schedule-task`：command の上書き

`variables.tf` の「任意パラメータ」に 2 つ足す。

| 変数 | 型 / 既定値 | description |
| --- | --- | --- |
| `container_name` | `string` / `null` | command を上書きするコンテナの名前 (modules/ecs-workload の container_name 出力)。command を指定するときは必須 |
| `command` | `list(string)` / `null` | 起動時にコンテナの command を上書きする (例: `["node", "dist/task/generate-questions.js"]`)。null なら task definition のまま (Dockerfile の CMD) |

`main.tf` は `locals` に `target_input` を足し、`target` に `input` を、resource に `precondition` を足す。

```hcl
locals {
  /** 既存の task_role_arn / task_definition_arn_wildcard はそのまま */

  /**
   * command を上書きするときだけ RunTask の overrides を target の input に渡す
   * (ECS のテンプレートターゲットは input を RunTask の overrides として扱う)。
   * null なら input を送らないので、既存のスケジュールの plan に差分は出ない
   */
  target_input = var.command == null ? null : jsonencode({
    containerOverrides = [{
      command = var.command
      name    = var.container_name
    }]
  })
}

resource "aws_scheduler_schedule" "this" {
  /** name / state / schedule_expression / flexible_time_window は変えない */

  target {
    arn      = var.cluster_arn
    input    = local.target_input
    role_arn = aws_iam_role.scheduler.arn

    /** ecs_parameters は変えない */
  }

  lifecycle {
    precondition {
      condition     = var.command == null || var.container_name != null
      error_message = "command を指定するときは container_name も指定してください。"
    }
  }
}
```

- 変数間の参照を `validation` に書くと Terraform 1.9 未満で使えない（module は `>= 1.6`）ので `precondition` にする
- 追加の IAM 権限は要らない。image の `ENTRYPOINT`（tini）は残り、`CMD` だけが置き換わる

### 4. `modules/ecs-workload`：コンテナ名の output

`outputs.tf` に `output "container_name"`（`value = var.name`、description「コンテナ名 (containerDefinitions[0].name)。RunTask の containerOverrides で指定する」）を足す。コンテナ名は `var.name` と同じだが、呼び出し側で文字列を組み立てないため。resource の差分は出ない。

### 5. `env/min`・`env/dev`・`env/prd`

`variables.tf` に 2 つ足す（いずれも `type = string`。`cron_schedule_timezone` は新しいスケジュールでも使うので、description を「cron のスケジュール式を解釈するタイムゾーン」に直す）。

| 変数 | 既定値 | description |
| --- | --- | --- |
| `generate_questions_schedule_expression` | `"cron(0 4 * * ? *)"` | generate:questions の起動スケジュール |
| `generate_questions_schedule_state` | `"ENABLED"`（dev は `"DISABLED"`） | generate:questions のスケジュールの有効/無効 (ENABLED / DISABLED) |

`main.tf` の変更は 2 か所。

```hcl
locals {
  secret_keys = {
    /** api / worker / migration は変えない */
    cron = ["DATABASE_URL", "NODE_ENV", "ANTHROPIC_API_KEY"]
  }
}

/**
 * cron のタスクごとのスケジュール。どれも module.ecs_cron の task definition を起動し、command だけを上書きする。
 * cleanup-old-memos は上書きなしの module.cron_schedule のまま
 */
locals {
  cron_task_schedules = {
    "generate-questions" = {
      command             = ["node", "dist/task/generate-questions.js"]
      schedule_expression = var.generate_questions_schedule_expression
      state               = var.generate_questions_schedule_state
    }
  }
}

module "cron_task_schedules" {
  source   = "../../modules/ecs-schedule-task"
  for_each = local.cron_task_schedules

  name                   = "${local.name_prefix}-${each.key}"
  cluster_arn            = local.ecs_common.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = local.ecs_common.execution_role_arn
  subnets                = local.ecs_common.subnets
  security_groups        = local.ecs_common.security_groups

  /** min だけ書く。dev / prd は private subnet + NAT なので書かない (既定 false) */
  assign_public_ip = true

  container_name = module.ecs_cron.container_name
  command        = each.value.command

  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = var.cron_schedule_timezone
  state                        = each.value.state

  tags = local.common_tags
}
```

### 6. `scripts/deploy/seed-secrets.sh`

`ANTHROPIC_API_KEY` は `CRON_ANTHROPIC_API_KEY` から受ける `add_kv` がもうあるので、スクリプトの変更は無い（手元のシェルによくある個人の `ANTHROPIC_API_KEY` を誤って書き込まないよう別名で受ける）。

- min の api（Lambda）には渡らない（`deploy-aws-min.yml` は `SECRET_KEYS_JSON` で api のキーだけを選ぶ）。workflow の変更は不要
- dev でも空にしない（`add_kv` は空なら skip し、キーが無いと cron が起動しない）

### 7. 適用の順番

Terraform は task definition の image を `cron:latest` で登録するが、CI はコミット SHA のタグしか push しない。apply で task definition が作り直されると、次の deploy までは Scheduler が `:latest` の revision を起動して image の取得に失敗する。

1. 各環境で secret を入れる：`CRON_ANTHROPIC_API_KEY=... ./scripts/deploy/seed-secrets.sh <env>`
2. `terraform apply`（CI なら `terraform-aws-env-apply.yml`）。**スケジュールの時刻（04:00 前後）を避ける**
3. 続けて `deploy-aws-<env>.yml` を実行する。`deploy-cron` が最新の revision（追加した secret を含む）を元に SHA の image で register し直す

ドキュメント：`apps/cron/CLAUDE.md` の冒頭（本番の起動）に「タスクを定期実行するときは `infra/terraform/aws/env/<env>/main.tf` の `local.cron_task_schedules` に足す」を 1 行足す。

## 動作確認

```bash
cd infra/terraform/aws/env/min   # dev / prd も同じ
terraform init && terraform validate
terraform fmt -check -recursive -diff ../..
tflint --chdir=. --config=$(pwd)/../../../.tflint.hcl --recursive
trivy config . -c .trivy.yml
terraform plan
```

plan（3 環境とも）：

- [ ] `module.cron_schedule`（既存の cleanup）に差分が無い（`input` が null のまま）
- [ ] `module.ecs_cron.aws_ecs_task_definition.this` が作り直しになり、差分が `secrets` の `ANTHROPIC_API_KEY` だけ
- [ ] `module.cron_task_schedules["generate-questions"]` に schedule・IAM role・role policy が 1 つずつ追加される。`target.input` が `{"containerOverrides":[{"command":["node","dist/task/generate-questions.js"],"name":"<prefix>-cron"}]}`
- [ ] min は `assign_public_ip = true` と public subnet、dev / prd は `false` と private subnet（外向きは NAT。ecs の SG は egress が全開で、ネットワークの変更は無い）
- [ ] dev は `state = "DISABLED"`、min / prd は `ENABLED`
- [ ] `command` だけ渡して `container_name` を渡さないと plan が precondition のエラーになる（一時的に書き換えて確認し、戻す）

AWS 上（min の例。apply と deploy の後）：

```bash
aws scheduler get-schedule --name tech-english-min-generate-questions \
  --query '{expr:ScheduleExpression,tz:ScheduleExpressionTimezone,state:State,input:Target.Input}'
aws ecs describe-task-definition --task-definition tech-english-min-cron \
  --query 'taskDefinition.containerDefinitions[0].{image:image,secrets:secrets[].name,environment:environment}'

# Scheduler と同じ overrides で手動起動する（ネットワークは terraform output の public_subnet_ids / ecs_security_group_id）
TASK_ARN=$(aws ecs run-task --cluster tech-english-min-cluster --task-definition tech-english-min-cron \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet>],securityGroups=[<sg>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"tech-english-min-cron","command":["node","dist/task/generate-questions.js","--passage-id=<collected の id>"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster tech-english-min-cluster --tasks "$TASK_ARN"
aws ecs describe-tasks --cluster tech-english-min-cluster --tasks "$TASK_ARN" \
  --query 'tasks[0].{stoppedReason:stoppedReason,exitCode:containers[0].exitCode}'
aws logs tail /ecs/tech-english-min-cron --since 30m
```

- [ ] `get-schedule` の `input` に正しいコンテナ名と command が入っている。2 本のスケジュールの時刻と state が想定どおり
- [ ] task definition の image がコミット SHA のタグで、`secrets` に `ANTHROPIC_API_KEY` がある
- [ ] generate の手動起動が exit 0 で、行が `draft` になる（Claude API に外向きで届いている）
- [ ] cleanup を overrides なしで起動して exit 0（追加した secret で壊れていない）
- [ ] `stoppedReason` が `OutOfMemoryError` なら `module "ecs_cron"` の `memory` を 1024 に上げる（LLM の応答で 512MB を超える場合）
- [ ] 翌日、CloudWatch Logs の `/ecs/tech-english-min-cron` に 04:00（generate・cleanup）のログストリームがあり、最後のログが失敗で終わっていない（ECS は停止したタスクを約 1 時間で消すので、exit code は手動起動で確かめる）
