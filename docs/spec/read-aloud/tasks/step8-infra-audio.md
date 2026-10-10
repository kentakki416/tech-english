# step8-infra-audio

本番で読み上げの音声を作って配信するための infra を足す：音声用の非公開の S3 bucket と CloudFront（OAC）、cron のタスクロール（Polly と bucket への書き込み）、cron と api の env、`generate:audio` の 1 時間ごとのスケジュール、Polly の費用の AWS Budgets のアラート。**AWS の設定（account の apply 権限・Budgets の宛先）が整ってから、1 つの infra の PR にまとめる。** 対象は `env/min`・`env/dev`・`env/prd` と `account/`。配信の方針は [README の音声の保存と配信](../README.md#音声の保存と配信)、費用は [費用](../README.md#費用)。

## 前提

- [step3-cron-generate-audio](./step3-cron-generate-audio.md)（`dist/task/generate-audio.js`、cron の env）・[step4-api-attempt-audio](./step4-api-attempt-audio.md)（api の `AUDIO_PUBLIC_URL_BASE`）がデプロイ済み
- [question-generation step7-infra-cron-schedules](../../question-generation/tasks/step7-infra-cron-schedules.md)（`local.cron_task_schedules`、`modules/ecs-schedule-task` の `command` / `container_name`、`module "ecs_cron"` の `environment`）
- [minimal-deploy step3-infra-env-min](../../minimal-deploy/tasks/step3-infra-env-min.md)・[step4-ci-deploy-min](../../minimal-deploy/tasks/step4-ci-deploy-min.md)（`env/min` と `deploy-aws-min.yml`）
- 東京リージョンで `Joanna` の Neural が使えることを Polly の voice の一覧で確かめておく

## 対応内容

### 1. 変更の一覧

| 場所 | 変更 |
| --- | --- |
| `modules/s3-cloudfront`（新規） | 非公開の bucket + CloudFront（OAC）+ bucket policy |
| `modules/ecs-task-role`（新規） | ECS のタスクロール（trust と inline policy） |
| `env/{min,dev,prd}/main.tf` | `module "audio_cdn"`・`module "cron_task_role"`、`ecs_cron` の `task_role_arn` と `environment`、スケジュールの `task_role_arn` と `generate-audio`、dev / prd の `ecs_api` の `environment` |
| `env/{min,dev,prd}/variables.tf`・`outputs.tf` | スケジュールの変数 2 つ、output 2 つ |
| `account/github_oidc.tf` | `ecs_deploy` に task role の `iam:PassRole` |
| `account/budgets.tf`（新規）・`account/variables.tf` | Polly の Budgets |
| `.github/workflows/deploy-aws-min.yml` | Lambda の env に `AUDIO_PUBLIC_URL_BASE` |

### 2. `modules/s3-cloudfront`

| 変数 | 型 / 既定値 | description |
| --- | --- | --- |
| `bucket_name` | `string` | bucket 名（全 AWS で一意）。distribution の comment と OAC の名前にも使う |
| `price_class` | `string` / `"PriceClass_200"` | CloudFront の価格クラス（日本のエッジを含む 200 を既定にする） |
| `force_destroy` | `bool` / `false` | destroy 時に中身ごと消すか |
| `tags` | `map(string)` / `{}` | ― |

output：`bucket_name`、`bucket_arn`、`distribution_arn`、`distribution_domain_name`、`public_url_base`（`"https://${aws_cloudfront_distribution.this.domain_name}"`）。

```hcl
resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags
}

/** aws_s3_bucket_public_access_block（4 つとも true）、aws_s3_bucket_ownership_controls（BucketOwnerEnforced）、
    aws_s3_bucket_server_side_encryption_configuration（AES256。OAC から読めるよう KMS にしない）も this で作る */

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = var.bucket_name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

/**
 * オリジンの Cache-Control（cron が public, max-age=31536000, immutable で保存する）に従って最長 1 年キャッシュする
 */
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = var.bucket_name
  http_version    = "http2and3"
  is_ipv6_enabled = true
  price_class     = var.price_class

  origin {
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
    origin_id                = "s3"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = false # mp3 は圧縮済み
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  /** 独自ドメインにしない（us-east-1 の証明書と provider の alias が要るため。必要になったら足す） */
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = var.tags
}
```

- bucket policy は `data "aws_iam_policy_document" "this"`（sid `AllowCloudFrontRead`：principal `cloudfront.amazonaws.com` に `${aws_s3_bucket.this.arn}/*` の `s3:GetObject` を許し、condition `StringEquals` `AWS:SourceArn` = distribution の ARN）を `aws_s3_bucket_policy.this` の直前に置く（infra の CLAUDE.md の IAM ポリシーの記述規約）
- 署名付き URL にしない（[README](../README.md#音声の保存と配信)）。CORS も設定しない（web の `<audio>` に `crossorigin` を付けないため。付けるなら response headers policy で web の origin を許可する）

### 3. `modules/ecs-task-role`

変数は `name`（role 名）・`policy_json`（inline policy の JSON。呼び出し側の `data "aws_iam_policy_document"`）・`tags`。output は `arn`・`name`。trust は `data "aws_iam_policy_document" "this_trust"`（`ecs-tasks.amazonaws.com` の `sts:AssumeRole`、`aws:SourceAccount` を自アカウントに限る。`modules/ecs-schedule-task` の `scheduler_trust` と同じ書き方）、permission は `aws_iam_role_policy "this"`（`name = "app"`）。

### 4. `env/min`・`env/dev`・`env/prd`

```hcl
data "aws_caller_identity" "current" {}

module "audio_cdn" {
  source = "../../modules/s3-cloudfront"

  bucket_name = "${local.name_prefix}-audio-${data.aws_caller_identity.current.account_id}"
  tags        = local.common_tags
}

/**
 * cron のアプリが AWS を呼ぶ権限（generate:audio）。これまで task role は execution role と共用だったが、
 * Polly と S3 の権限を execution role（worker / migration と共有）に足さないため分ける
 */
data "aws_iam_policy_document" "cron_task" {
  statement {
    sid       = "SynthesizeSpeech"
    actions   = ["polly:SynthesizeSpeech"]
    resources = ["*"]
  }

  statement {
    sid       = "WriteAudioObjects"
    actions   = ["s3:DeleteObject", "s3:PutObject"]
    resources = ["${module.audio_cdn.bucket_arn}/passages/*"]
  }
}

module "cron_task_role" {
  source = "../../modules/ecs-task-role"

  name        = "${local.name_prefix}-cron-task-role"
  policy_json = data.aws_iam_policy_document.cron_task.json
  tags        = local.common_tags
}
```

- `polly:SynthesizeSpeech` の `resources` は、Service Authorization Reference でリソースの型（lexicon）を確かめて決める。絞れなければ `*` のまま、trivy の指摘を §7 の扱いにする
- `module "ecs_cron"` に `task_role_arn = module.cron_task_role.arn` を足し、`environment`（question-generation step7 の `COLLECT_WEB_CONTACT_URL`）に `AUDIO_STORAGE_S3_BUCKET = module.audio_cdn.bucket_name`・`AUDIO_STORAGE_TYPE = "s3"`・`AWS_REGION = var.aws_region`・`TTS_PROVIDER = "polly"` を足す（キーはアルファベット順。`TTS_VOICE_ID`・`AUDIO_MAX_PASSAGES_PER_RUN` は既定値のまま渡さない）
- `module "cron_schedule"` と `module "cron_task_schedules"` に `task_role_arn = module.cron_task_role.arn` を足す（Scheduler の role が RunTask のときに task role を `iam:PassRole` できるようにする。module が `task_role_arn` から policy を作る）
- `local.cron_task_schedules` に足す

```hcl
    "generate-audio" = {
      command             = ["node", "dist/task/generate-audio.js"]
      schedule_expression = var.generate_audio_schedule_expression
      state               = var.generate_audio_schedule_state
    }
```

| 変数（`variables.tf`） | 既定値 | description |
| --- | --- | --- |
| `generate_audio_schedule_expression` | `"cron(30 * * * ? *)"` | generate:audio の起動スケジュール（1 時間ごと。毎時 30 分にして 03:00 / 04:00 のタスクと時刻をずらす） |
| `generate_audio_schedule_state` | `"ENABLED"`（dev は `"DISABLED"`） | generate:audio のスケジュールの有効/無効。dev は Polly の費用を本番と二重に出さないため止める |

- dev / prd の `module "ecs_api"` に `environment = { AUDIO_PUBLIC_URL_BASE = module.audio_cdn.public_url_base }` を足す（既に `environment` があれば足す）。task definition の差分は次の deploy で SHA の image の revision に引き継がれる
- `outputs.tf`：`audio_bucket_name`、`audio_public_url_base`

### 5. `deploy-aws-min.yml`（min の api は Lambda なので env を workflow が入れる）

- `deploy-api` の job の `env` に `AUDIO_PUBLIC_URL_BASE: ${{ vars.AUDIO_PUBLIC_URL_BASE }}` を足す（`API_URL` と同じく GitHub Environment `min` の variable。値は `terraform output -raw audio_public_url_base`）
- 値があれば `^https://[^/]+$` を検査し、`FIXED_ENV_JSON` に `AUDIO_PUBLIC_URL_BASE` を足す。空なら `::warning::` を出して渡さない（api は音声を `pending` で返すだけで、デプロイは止めない）

### 6. `account/`

- `github_oidc.tf` の `data "aws_iam_policy_document" "ecs_deploy"` に statement `PassTaskRoles`（`iam:PassRole`、`arn:aws:iam::<account>:role/${var.project_name}-*-task-role`）を足す。deploy の `register-task-definition` は前の revision の `taskRoleArn` を引き継ぐので、min の deploy role（AdministratorAccess を持たない）にこの権限が無いと cron の登録が AccessDenied になる
- `budgets.tf`：Polly の課金は env ごとのタグで分けられない（`SynthesizeSpeech` はリソースを作らない）ので、アカウントに 1 つ置く

```hcl
resource "aws_budgets_budget" "polly" {
  count = length(var.budget_alert_emails) > 0 ? 1 : 0

  name         = "${var.project_name}-polly-monthly"
  budget_type  = "COST"
  limit_amount = var.polly_monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Polly"]
  }

  /** 実績が 80% を超えたとき。同じ形で notification_type = "FORECASTED"・threshold = 100（予測が上限を超えたとき）をもう 1 つ */
  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
  }
}
```

| 変数（`account/variables.tf`） | 型 / 既定値 | description |
| --- | --- | --- |
| `budget_alert_emails` | `list(string)` / `[]` | Budgets の通知先。空なら作らない。CI の apply は変数を渡さないので、宛先はチームで決めて既定値に書く |
| `polly_monthly_budget_usd` | `string` / `"30"` | Polly の月の上限（生成タスクの上限の月 300 問で約 $23） |

- `cost_filter` の書き方と `Service` の値（`Amazon Polly`）は、使っている AWS provider のドキュメントと Budgets のコンソールの表示名で確かめる

### 7. trivy

S3 のアクセスログ・バージョニング、CloudFront の WAF・アクセスログ・既定の証明書の TLS の版、IAM の wildcard などの指摘が出る。内容を確認し、許容するものだけ理由のコメントを付けて各 env の `.trivyignore` に足す（ルール ID は trivy の出力から取る。mp3 は本文から作り直せるのでバージョニングは不要、など）。

### 8. 適用の順番

1. `account/` を apply（`terraform-aws-account-apply.yml`）：PassRole と Budgets
2. 各 env を apply（`terraform-aws-env-apply.yml`）。**毎時 30 分と 03:00〜05:00 を避ける**（apply で cron の task definition が `:latest` の image で作り直され、次の deploy までスケジュールが image の取得に失敗するため。question-generation step7 と同じ）
3. min は GitHub Environment `min` の variable `AUDIO_PUBLIC_URL_BASE` に `terraform output -raw audio_public_url_base` を入れる
4. 続けて `deploy-aws-<env>.yml` を実行する（cron が task role と env 込みの revision を SHA の image で登録し直し、api に `AUDIO_PUBLIC_URL_BASE` が入る）

`apps/cron/CLAUDE.md` の `generate:audio` の行に「本番は毎時 30 分（`local.cron_task_schedules`）」を足す。

## 動作確認

```bash
cd infra/terraform/aws/env/min   # dev / prd、account も同じ
terraform init && terraform validate
terraform fmt -check -recursive -diff ../..
tflint --chdir=. --config=$(pwd)/../../../.tflint.hcl --recursive
trivy config . -c .trivy.yml
terraform plan
```

plan：

- [ ] `module.audio_cdn` に bucket・public access block・ownership・暗号化・OAC・distribution・bucket policy が追加される
- [ ] `module.cron_task_role` が追加され、`module.ecs_cron` の task definition の差分が `taskRoleArn` と `environment` の 4 つだけ
- [ ] `module.cron_schedule` / `module.cron_task_schedules[*]` の scheduler の policy の PassRole に task role が加わり、`["generate-audio"]` が追加される（`input` の command が `dist/task/generate-audio.js`）。dev は `DISABLED`
- [ ] dev / prd の `module.ecs_api` の差分が `environment` の `AUDIO_PUBLIC_URL_BASE` だけ

AWS 上（min の例。apply と deploy の後）：

```bash
BUCKET=$(terraform output -raw audio_bucket_name)
BASE=$(terraform output -raw audio_public_url_base)
TASK_ARN=$(aws ecs run-task --cluster tech-english-min-cluster --task-definition tech-english-min-cron \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet>],securityGroups=[<sg>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"tech-english-min-cron","command":["node","dist/task/generate-audio.js"]}]}' \
  --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster tech-english-min-cluster --tasks "$TASK_ARN"
aws ecs describe-tasks --cluster tech-english-min-cluster --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode'
aws s3 ls "s3://${BUCKET}/passages/" --recursive | head
curl -sI "${BASE}/passages/<id>/<hash>/0-0.mp3"
curl -sI "https://${BUCKET}.s3.ap-northeast-1.amazonaws.com/passages/<id>/<hash>/0-0.mp3"
```

- [ ] generate:audio が exit 0 で、公開中の問題の `passage_audios` が `ready`。S3 に mp3 がある。ログに資格情報・権限のエラーが無い
- [ ] CloudFront の URL が 200 で `content-type: audio/mpeg`・`cache-control: public, max-age=31536000, immutable`。2 回目は `x-cache: Hit from cloudfront`。`Range: bytes=0-99` で 206
- [ ] S3 の URL を直接開くと 403（bucket は非公開）
- [ ] 挑戦の `GET /api/attempt/:id/audio` の `url` が CloudFront の URL で、web と mobile で再生できる
- [ ] `aws budgets describe-budgets --account-id <id>` に `tech-english-polly-monthly` がある（宛先を設定した場合）。確認のメールが届く
- [ ] 翌日、CloudWatch Logs の `/ecs/tech-english-min-cron` に毎時 30 分の generate:audio のログがあり、失敗で終わっていない
