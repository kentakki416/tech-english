import { z } from "zod"

const cronEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url().optional(),
    LOGGER_TYPE: z
      .enum(["pino", "winston", "console", "silent"])
      .default("pino"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /**
     * cleanup-old-memos が削除対象とする「何日以上前の memo か」の閾値
     */
    CLEANUP_MEMO_OLDER_THAN_DAYS: z.coerce.number().int().positive().default(90),
    /**
     * collect-passages が GitHub API に使う token（公開リポジトリの読み取りだけを許可した fine-grained token）。
     * 他のタスクでは不要なので任意。未設定なら認証なし（60 req/h）で動き、task の起動時に warn を出す
     */
    GITHUB_CONTENT_TOKEN: z.string().optional(),
    /**
     * collect-passages が 1 回の実行で 1 ソースから取得する文書数の上限。超えた分は次回に回す
     */
    COLLECT_MAX_DOCUMENTS_PER_SOURCE: z.coerce.number().int().positive().default(100),
    /**
     * collect-passages が 1 回の実行で作る本文候補の上限（生成側の処理量を超えて溜め込まないため）
     */
    COLLECT_MAX_PASSAGES_PER_RUN: z.coerce.number().int().positive().default(200),
    /**
     * collect-passages がサイトをクロールするときの、同じホストへのリクエストの間隔（ミリ秒）。1 秒未満にはできない
     */
    COLLECT_WEB_REQUEST_INTERVAL_MS: z.coerce.number().int().min(1000).default(1000),
    /**
     * collect-passages がサイトのページを取り直す間隔（日）
     */
    COLLECT_WEB_REFETCH_DAYS: z.coerce.number().int().positive().default(7),
    /**
     * 収集のリクエストの User-Agent に入れるサービスのトップの URL（`TechEnglishBot/1.0 (+{url})`）。
     * 他のタスクでは不要なので任意。未設定なら `TechEnglishBot/1.0` だけを送る
     */
    COLLECT_WEB_CONTACT_URL: z.string().url().optional(),
    /**
     * generate-questions が Claude API に使うキー。他のタスクでは不要なので任意にし、必須かどうかは task の起動時に検査する。
     * 空文字は未設定と同じ扱いにする（`.env.local` に `ANTHROPIC_API_KEY=` だけ書かれていても他のタスクを止めない）
     */
    ANTHROPIC_API_KEY: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    /**
     * generate-questions の生成モデル
     */
    GENERATION_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
    /**
     * generate-questions の解答キーを見ない検証のモデル（生成とは別のモデルに解かせる）
     */
    VERIFICATION_MODEL: z.string().min(1).default("claude-haiku-4-5-20251001"),
    /**
     * generate-questions が 1 回の実行で生成する件数の上限（費用の上限）
     */
    GENERATE_MAX_PASSAGES_PER_RUN: z.coerce.number().int().positive().default(10),
    /**
     * 確認待ちの下書き（status = draft）がこの件数以上なら generate-questions は生成しない（確認が追いつかないのに費用を使わないため）
     */
    GENERATE_MAX_PENDING_DRAFTS: z.coerce.number().int().positive().default(50),
    /**
     * generate-audio・generate-word-audio の音声合成。polly は Amazon Polly（AWS の資格情報が要る）、fake は無音の mp3 と等間隔の単語の時刻（ローカルの確認用）。
     * 未設定なら production は polly、それ以外は fake（手元に AWS の資格情報があっても、明示しない限り Polly を呼んで課金しないため）
     */
    TTS_PROVIDER: z.enum(["polly", "fake"]).optional(),
    /**
     * generate-audio・generate-word-audio の Polly の voice（Neural に対応したもの）。変えると、voice_id が違う ready の音声を生成タスクが確保し、
     * 次の実行から問題は AUDIO_MAX_PASSAGES_PER_RUN 件ずつ、単語は WORD_AUDIO_MAX_PER_RUN 語ずつ作り直す（text_hash にも voice を含むので保存キーも変わる）。
     * TTS_PROVIDER=fake のときの voice_id は fake:<TTS_VOICE_ID>（buildAudioVoiceId）
     */
    TTS_VOICE_ID: z.string().min(1).default("Joanna"),
    /**
     * generate-audio・generate-word-audio が使う Polly と S3 のリージョン
     */
    AWS_REGION: z.string().min(1).default("ap-northeast-1"),
    /**
     * generate-audio が 1 回の実行で確保する問題の上限（Polly の費用の上限）
     */
    AUDIO_MAX_PASSAGES_PER_RUN: z.coerce.number().int().positive().default(20),
    /**
     * generate-audio が今月（UTC の暦月。Polly の請求の月）に Polly で課金してよい文字数（audio_synthesis_usages の合計）。
     * 各問題を作る前に「今月の合計 + その問題の見込み」が超えるなら、確保を外して exit 1 で止める（作り直し・不具合の繰り返しで課金が膨らまないため）。
     * generate-word-audio（単語の発音）も同じ上限を使い、読み上げと合算して数える（単語は月 1 万語で約 10 万文字・約 $1.6）。
     * 既定の 180 万文字（約 $29）は、README の費用の試算の「月 300 問を公開」（1 問 4,800 文字 × 300 = 144 万文字・約 $23）に
     * 失敗の再試行・admin の作り直しの分として 25% の余裕を持たせ、Polly の Budgets の上限（$30）より手前で止まる値。
     * voice の変更などで公開済みの問題をまとめて作り直す月は、一時的に上げる
     */
    AUDIO_MONTHLY_CHARACTER_LIMIT: z.coerce.number().int().positive().default(1_800_000),
    /**
     * generate-word-audio（単語の発音）が 1 回の実行で確保する見出し語の上限。1 語は mp3 の 1 リクエスト（平均 約 10 文字）。
     * 課金は AUDIO_MONTHLY_CHARACTER_LIMIT で読み上げと合算して止める
     */
    WORD_AUDIO_MAX_PER_RUN: z.coerce.number().int().positive().default(300),
    /**
     * generate-audio・generate-word-audio の mp3 の保存先。local は AUDIO_STORAGE_LOCAL_DIR、s3 は AUDIO_STORAGE_S3_BUCKET。
     * production の local は 2 つのタスクの起動時に throw する（コンテナの一時領域に mp3 を書いて ready にしないため）。
     * スキーマでは検査しない（cron の他のタスクを止めないため）
     */
    AUDIO_STORAGE_TYPE: z.enum(["local", "s3"]).default("local"),
    /**
     * local の保存先（apps/cron からの相対。pnpm のスクリプトは apps/cron で動くので、リポジトリ直下の .storage/audio/ になり、api の /media 配信と共有する）
     */
    AUDIO_STORAGE_LOCAL_DIR: z.string().min(1).default("../../.storage/audio"),
    /**
     * s3 の保存先の bucket。AUDIO_STORAGE_TYPE=s3 のとき必須（空文字は未設定と同じ）
     */
    AUDIO_STORAGE_S3_BUCKET: z
      .string()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when NODE_ENV is not 'test'",
        path: ["DATABASE_URL"],
      })
    }
    if (env.AUDIO_STORAGE_TYPE === "s3" && !env.AUDIO_STORAGE_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUDIO_STORAGE_S3_BUCKET is required when AUDIO_STORAGE_TYPE is 's3'",
        path: ["AUDIO_STORAGE_S3_BUCKET"],
      })
    }
  })
  .transform((env) => ({
    ...env,
    TTS_PROVIDER: env.TTS_PROVIDER ?? (env.NODE_ENV === "production" ? "polly" : "fake"),
  }))

const result = cronEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type CronEnv = typeof env
