import { drizzle } from "drizzle-orm/node-postgres"
import { type PgAsyncWithReplicas, withReplicas } from "drizzle-orm/pg-core"
import { Pool } from "pg"

import { buildConnectionString } from "../connection-string"

export type CreateDrizzleClientOptions = {
  /**
   * 接続文字列を明示指定する。省略時は process.env.DATABASE_URL (+ DB_NAME 上書き)
   */
  url?: string
  /**
   * read replica の接続文字列。省略時は process.env.DATABASE_REPLICA_URL を読み、
   * それも無ければ replica を使わない（primary のみで read/write 両方を扱う）
   */
  replicaUrl?: string
  /**
   * pg の Pool はアイドル中の接続が切れると `error` を emit し、**リスナが無いとプロセスが落ちる**。
   * 省略時は console.error にフォールバックするが、各 app の logger を渡すのが望ましい。
   */
  onError?: (error: Error) => void
}

/**
 * 接続ごとにセッションのタイムゾーンを UTC に固定する。
 *
 * 日時の列は `timestamp`（タイムゾーン無し）で、Drizzle はこれを UTC として読み書きする。
 * 一方 DB の default の `now()` はセッションのタイムゾーンで評価されるため、Postgres 側が
 * UTC 以外（ローカルの docker-compose は TZ=Asia/Tokyo）だと created_at が 9 時間ずれて入る。
 */
const createPool = (connectionString: string, onError: (error: Error) => void): Pool => {
  const pool = new Pool({ connectionString, options: "-c TimeZone=UTC" })
  pool.on("error", onError)
  return pool
}

const createDatabase = (pool: Pool) => drizzle({ client: pool })

/**
 * Drizzle の DB client。read / write の振り分けと `$primary` は withReplicas が提供する。
 * `$disconnect()` は primary / replica の Pool を閉じる。
 */
export type DrizzleClient = PgAsyncWithReplicas<ReturnType<typeof createDatabase>> & {
  $disconnect: () => Promise<void>
}

/**
 * `DrizzleClient.transaction()` の callback が受け取るトランザクション。
 */
export type DrizzleTransaction = Parameters<Parameters<DrizzleClient["transaction"]>[0]>[0]

/**
 * Drizzle の DB client のファクトリ
 * 各 app の src/index.ts で 1 回呼び、Repository コンストラクタに渡す。
 *
 * read replica が設定されている場合は withReplicas で自動振り分け：
 *   - select / $count / with などの read → replica
 *   - insert / update / delete / execute / transaction → primary
 * 強整合性が必要な read は db.$primary.select()... で primary 強制可能。
 *
 * replica が無いときも primary を replica として渡し、戻り値の型と `$primary` の有無を揃えている。
 */
export const createDrizzleClient = (options: CreateDrizzleClientOptions = {}): DrizzleClient => {
  const onError = options.onError ?? ((error: Error): void => {
    console.error("[db] idle client error:", error.message)
  })
  const primaryPool = createPool(options.url ?? buildConnectionString(), onError)
  const primary = createDatabase(primaryPool)

  const replicaUrl = options.replicaUrl ?? process.env.DATABASE_REPLICA_URL
  const replicaPool = replicaUrl ? createPool(replicaUrl, onError) : undefined
  const replica = replicaPool ? createDatabase(replicaPool) : primary

  return Object.assign(withReplicas(primary, [replica]), {
    $disconnect: async (): Promise<void> => {
      await Promise.all([primaryPool.end(), replicaPool?.end()])
    },
  })
}
