import { createDrizzleClient, type DrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

import { env } from "./env"

export type TaskContext = {
  db: DrizzleClient
}

/**
 * シグナル → 終了コードの対応（慣例の `128 + シグナル番号`）。
 * SIGTERM(15)=143 / SIGINT(2)=130。
 */
const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
} as const satisfies Partial<Record<NodeJS.Signals, number>>

/**
 * task を 1 回実行して exit する。
 *
 * シグナルを受けたら task の完了は待たずに終了する（実行中のクエリ・トランザクションの完了を待ってから切断する）。
 * 中断はタスク未完了なので、exit 0 にするとスケジューラが成功と誤認する。よって非 0 で終了する。
 */
export const runTask = (name: string, task: (context: TaskContext) => Promise<void>): void => {
  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })

  let disconnecting: Promise<void> | undefined
  /**
   * pg の Pool.end() は 2 回目の呼び出しを reject するので、1 回目の Promise を使い回す
   */
  const disconnect = async (): Promise<void> => {
    disconnecting ??= db.$disconnect().catch((err: unknown) => {
      logger.error(
        "db disconnect failed",
        err instanceof Error ? err : new Error(String(err)),
      )
      process.exitCode = 1
    })
    await disconnecting
  }

  let interrupted = false
  const exitOnSignal = async (signal: keyof typeof SIGNAL_EXIT_CODES): Promise<void> => {
    if (interrupted) return
    interrupted = true
    logger.warn(`${name} interrupted`, { signal })
    await disconnect()
    process.exit(SIGNAL_EXIT_CODES[signal])
  }
  process.on("SIGTERM", () => void exitOnSignal("SIGTERM"))
  process.on("SIGINT", () => void exitOnSignal("SIGINT"))

  task({ db })
    .finally(disconnect)
    .catch((err: unknown) => {
      /**
       * 中断で DB を切断したために落ちた場合は、終了コードを exitOnSignal 側に任せる
       */
      if (interrupted) return
      logger.error(
        `${name} failed`,
        err instanceof Error ? err : new Error(String(err)),
      )
      process.exit(1)
    })
}
