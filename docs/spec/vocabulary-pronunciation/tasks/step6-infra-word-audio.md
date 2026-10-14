# step6-infra-word-audio

cron のタスクロールに単語の音声の保存先（`words/*`）の権限を足し、`generate:word-audio` のスケジュール（1 時間ごと）を足す。bucket・CloudFront・Polly の権限・Budgets は読み上げのものを使う。AWS の設定の後に、読み上げの [step8-infra-audio](../../read-aloud/tasks/step8-infra-audio.md) と同じ infra の PR にまとめてよい。

## 前提

- read-aloud の [step8-infra-audio](../../read-aloud/tasks/step8-infra-audio.md)（`module "audio_cdn"`・`module "cron_task_role"`・`local.cron_task_schedules`・Budgets）
- [step2-cron-generate-word-audio](./step2-cron-generate-word-audio.md)（`dist/task/generate-word-audio.js`）
- infra の規約：[infra/terraform/CLAUDE.md](../../../../infra/terraform/CLAUDE.md)

## 対応内容

### 1. cron のタスクロールの S3 の権限

`env/{min,dev,prd}/main.tf` の `data "aws_iam_policy_document" "cron_task"` の `WriteAudioObjects` の `resources` に `words/*` を足す。

```hcl
  statement {
    sid       = "WriteAudioObjects"
    actions   = ["s3:DeleteObject", "s3:PutObject"]
    resources = [
      "${module.audio_cdn.bucket_arn}/passages/*",
      "${module.audio_cdn.bucket_arn}/words/*",
    ]
  }
```

- コメントの「generate:audio」を「generate:audio・generate:word-audio」にする
- Polly の権限（`SynthesizeSpeech`）は同じ statement のまま

### 2. スケジュール

`local.cron_task_schedules` に足す（キーは名前順）。

```hcl
    "generate-word-audio" = {
      command             = ["node", "dist/task/generate-word-audio.js"]
      schedule_expression = var.generate_word_audio_schedule_expression
      state               = var.generate_word_audio_schedule_state
    }
```

| 変数（`variables.tf`） | 既定値 | description |
| --- | --- | --- |
| `generate_word_audio_schedule_expression` | `"cron(45 * * * ? *)"` | generate:word-audio の起動スケジュール（1 時間ごと。generate:audio の毎時 30 分とずらして、月の上限の集計が同時に走らないようにする） |
| `generate_word_audio_schedule_state` | `"ENABLED"`（dev は `"DISABLED"`） | generate:word-audio のスケジュールの有効/無効。dev は Polly の費用を本番と二重に出さないため止める |

### 3. env と Budgets

- cron の `environment` は読み上げのもの（`AUDIO_STORAGE_*`・`AWS_REGION`・`TTS_PROVIDER`）を共有する。`WORD_AUDIO_MAX_PER_RUN` は既定（300）のまま渡さない
- Budgets（`polly_monthly_budget_usd`）と `AUDIO_MONTHLY_CHARACTER_LIMIT` は変えない。単語の音声は月 1 万語で約 $1.6 なので、読み上げの見積もり（月 300 問で約 $23）に足しても上限の手前に収まる（[README の費用](../README.md#費用)）
- api の `AUDIO_PUBLIC_URL_BASE` は読み上げで設定済み（単語の URL も同じ base）

## 動作確認

```bash
cd infra/terraform/aws/env/min && terraform fmt -check && terraform validate && terraform plan
```

- [ ] plan の差分が、cron のタスクロールの policy（`words/*`）と `generate-word-audio` のスケジュールだけ
- [ ] `aws ecs run-task` で `generate-word-audio` を 1 回動かし、`aws s3 ls "s3://${BUCKET}/words/" | head` に mp3 があり、`curl -sI "${BASE}/words/<hash>.mp3"` が 200（`Content-Type: audio/mpeg`・`Cache-Control: public, max-age=31536000, immutable`）
- [ ] `word_audios` の行が `ready` になり、単語帳のカードの単語のボタンで再生できる
