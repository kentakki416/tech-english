import { z } from "zod"

const workerEnvSchema = z
  .object({
    /**
     * collect-source が 1 回の収集（1 ソース）で取得する文書数の上限。超えた分は次の収集で続きから取り込む
     */
    COLLECT_MAX_DOCUMENTS_PER_SOURCE: z.coerce.number().int().positive().default(100),
    /**
     * collect-source が 1 回の収集（1 ソース）で作る本文候補の上限（生成側の処理量を超えて溜め込まないため）
     */
    COLLECT_MAX_PASSAGES_PER_RUN: z.coerce.number().int().positive().default(200),
    /**
     * 収集のリクエスト（GitHub API）の User-Agent に入れるサービスのトップの URL（`TechEnglishBot/1.0 (+{url})`）。
     * 任意。未設定なら `TechEnglishBot/1.0` だけを送る
     */
    COLLECT_WEB_CONTACT_URL: z.string().url().optional(),
    DATABASE_URL: z.string().url().optional(),
    DATA_WAREHOUSE_DATABASE: z.string().default("tech_english"),
    DATA_WAREHOUSE_PASSWORD: z.string().default("password"),
    /**
     * `none` は何も書かない実装を使う。
     *
     * 行動イベントの分析価値が無い環境のために ClickHouse を持つのはコストに
     * 見合わないため、繋ぎ先を持たない選択肢を用意する。
     */
    DATA_WAREHOUSE_TYPE: z.enum(["clickhouse", "none"]).default("clickhouse"),
    /**
     * 名前に ClickHouse を入れていないのは、データウェアハウスを差し替えても env の名前を変えずに済ませるため
     */
    DATA_WAREHOUSE_URL: z.string().url().optional(),
    DATA_WAREHOUSE_USER: z.string().default("default"),
    /**
     * collect-source が GitHub API に使う token（公開リポジトリの読み取りだけを許可した fine-grained token）。
     * 任意。未設定なら認証なし（60 req/h）で動き、起動時に warn を出す
     */
    GITHUB_CONTENT_TOKEN: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    LOGGER_TYPE: z
      .enum(["pino", "winston", "console", "silent"])
      .default("pino"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    REDIS_URL: z.string().optional(),
    /**
     * process-memo・track-event の queue ごとの同時実行ジョブ数（プロセス全体の上限ではない。collect-source は 1 固定）
     */
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "test" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is required when NODE_ENV is not 'test'",
        path: ["DATABASE_URL"],
      })
    }
    if (
      env.NODE_ENV !== "test"
      && env.DATA_WAREHOUSE_TYPE === "clickhouse"
      && !env.DATA_WAREHOUSE_URL
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATA_WAREHOUSE_URL is required when DATA_WAREHOUSE_TYPE is 'clickhouse'",
        path: ["DATA_WAREHOUSE_URL"],
      })
    }
    if (env.NODE_ENV !== "test" && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "REDIS_URL is required when NODE_ENV is not 'test'",
        path: ["REDIS_URL"],
      })
    }
  })

const result = workerEnvSchema.safeParse(process.env)
if (!result.success) {
  console.error("Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type WorkerEnv = typeof env
