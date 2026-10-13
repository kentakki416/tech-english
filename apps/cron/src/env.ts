import { z } from "zod"

/**
 * apps/cron の環境変数スキーマ
 *
 * このモジュールが import された時点で safeParse が走り、
 * 不正な env の場合は stderr にエラーを出力して process.exit(1) で停止する。
 *
 * 各 task (src/task/*.ts) は最初に `import { env } from "../env"` するだけで
 * 起動前に env 検証が済む。
 */
const cronEnvSchema = z
  .object({
    /** 起動環境。test の場合は DATABASE_URL の必須化を緩める */
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** DB の接続文字列。NODE_ENV !== "test" のときは必須 */
    DATABASE_URL: z.string().url().optional(),
    /** ロガー実装の選択（pino / winston / console / silent） */
    LOGGER_TYPE: z
      .enum(["pino", "winston", "console", "silent"])
      .default("pino"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    /**
     * cleanup-old-memos が削除対象とする「何日以上前の memo か」の閾値。
     * デフォルトは 90 日。
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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when NODE_ENV is not 'test'",
        path: ["DATABASE_URL"],
      })
    }
  })

const result = cronEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type CronEnv = typeof env
