import type { DrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

export type ShutdownHandle = {
  isShuttingDown: () => boolean
}

/**
 * シグナル → 終了コードの対応（慣例の `128 + シグナル番号`）。
 * SIGTERM(15)=143 / SIGINT(2)=130。
 */
const SIGNAL_EXIT_CODES: Record<string, number> = {
  SIGINT: 130,
  SIGTERM: 143,
}

/**
 * SIGTERM (ECS Scheduled Task の停止シグナル) / SIGINT (Ctrl-C) を受けたとき
 * DB を disconnect してから process.exit する graceful shutdown を登録する。
 *
 * このプロセスは「タスク 1 回実行で exit する」run-once モデルのため、処理の
 * 途中でシグナルを受けて終了する場合は **タスクが未完了** であることを意味する。
 * その場合 exit 0 を返すとスケジューラ（EventBridge / ECS Scheduled Task /
 * K8s CronJob）が「成功」と誤認し、削除が途中で止まっても次回まで気付けない。
 * よって中断時は非 0（慣例の `128 + シグナル番号`）で終了し「中断 = 失敗」を伝える。
 *
 * 返り値の isShuttingDown は task 側のループや finally から「停止指示を受けたか」を
 * 読むためのハンドル。進行中の処理自体は中断しないので、長時間ループや batch では
 * 各 iteration の頭でこれをチェックして自発的に break すること。
 */
export const setupGracefulShutdown = (db: DrizzleClient): ShutdownHandle => {
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.warn("shutdown initiated", { signal })
    try {
      await db.$disconnect()
    } catch (err) {
      logger.error(
        "db disconnect failed during shutdown",
        err instanceof Error ? err : new Error(String(err)),
      )
    }
    process.exit(SIGNAL_EXIT_CODES[signal] ?? 1)
  }
  process.on("SIGTERM", (signal) => void shutdown(signal))
  process.on("SIGINT", (signal) => void shutdown(signal))
  return { isShuttingDown: () => shuttingDown }
}
