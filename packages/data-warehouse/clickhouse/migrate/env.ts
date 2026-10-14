import { z } from "zod"

/**
 * ClickHouse の migration コマンドの環境変数スキーマ
 *
 * 既定値はローカルの docker compose で動く値にする（.env を置かずに migrate だけで動くように）。
 * AWS では ECS のタスク定義が secret と environment で上書きする。
 *
 * このモジュールが import された時点で safeParse が走り、
 * 不正な env の場合は stderr にエラーを出力して process.exit(1) で停止する。
 */
/**
 * URL の protocol を返す。URL として読めなければ undefined
 *
 * 形式の誤りは z.string().url() が報告する。Zod 3 は url() が失敗しても superRefine を実行するため、
 * ここで new URL() の例外を投げると検証のエラーにならずに落ちる。
 */
const readUrlProtocol = (value: string): string | undefined => {
  try {
    return new URL(value).protocol
  } catch {
    return undefined
  }
}

const envSchema = z
  .object({
    /**
     * CDC の実装。view の定義に埋める値と、ローカルの CDC を作り直すかを決める。
     * none は CDC を張っていない環境で、view を作らない。
     */
    DATA_WAREHOUSE_CDC: z
      .enum(["materialized_postgresql", "clickpipes", "none"])
      .default("materialized_postgresql"),
    /**
     * migration と view を置く database。clickhouse-migrations が CREATE DATABASE に埋め込むため、識別子に限る
     */
    DATA_WAREHOUSE_DATABASE: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default("tech_english"),
    DATA_WAREHOUSE_PASSWORD: z.string().default("password"),
    DATA_WAREHOUSE_URL: z.string().url().default("http://localhost:8124"),
    DATA_WAREHOUSE_USER: z.string().default("default"),
    /**
     * ローカルの MaterializedPostgreSQL が接続する Postgres。
     * **ClickHouse のコンテナから見た**接続先なので、ホストは docker compose のサービス名になる。
     * DATA_WAREHOUSE_CDC が materialized_postgresql のときだけ使う。
     */
    LOCAL_CDC_POSTGRES_DATABASE: z.string().default("tech-english_dev"),
    LOCAL_CDC_POSTGRES_HOST: z.string().default("postgres:5432"),
    LOCAL_CDC_POSTGRES_PASSWORD: z.string().default("password"),
    LOCAL_CDC_POSTGRES_USER: z.string().default("postgres"),
  })
  .superRefine((env, ctx) => {
    /**
     * materialized_postgresql は pg_cdc を消して作り直すローカル用のモード。
     * ClickHouse Cloud（https）に向けて流さないよう、タスク定義で DATA_WAREHOUSE_CDC を
     * 書き忘れたとき（既定値がこのモード）に止める。
     */
    const protocol = readUrlProtocol(env.DATA_WAREHOUSE_URL)
    if (env.DATA_WAREHOUSE_CDC === "materialized_postgresql" && protocol !== undefined && protocol !== "http:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATA_WAREHOUSE_CDC=materialized_postgresql is only for the local ClickHouse (http). Set clickpipes or none",
        path: ["DATA_WAREHOUSE_CDC"],
      })
    }
  })

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error("Invalid environment variables:")
  console.error(JSON.stringify(result.error.format(), null, 2))
  process.exit(1)
}

export const env = result.data

export type CdcMode = typeof env.DATA_WAREHOUSE_CDC

export const forTesting = { envSchema }
