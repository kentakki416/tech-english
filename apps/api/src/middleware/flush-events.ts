import type { NextFunction, Request, Response } from "express"

import type { EventTracker } from "@repo/events"
import { logger } from "@repo/logger"

/** flush を待つ上限。Queue が遅くてもレスポンスを止めすぎないため */
const FLUSH_TIMEOUT_MS = 3000

/**
 * flush を上限付きで待つ。上限に達したら warn を残して先に進む（送出中のイベントは失われうる）
 */
const waitForFlush = async (eventTracker: EventTracker): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), FLUSH_TIMEOUT_MS)
  })
  const result = await Promise.race([eventTracker.flush().then(() => "flushed" as const), timeout])
  clearTimeout(timer)

  if (result === "timeout") {
    logger.warn("event flush timed out before response", { timeoutMs: FLUSH_TIMEOUT_MS })
  }
}

/**
 * レスポンスを返す前に、送出中の行動イベントを送り切る middleware。
 *
 * Lambda はレスポンスを返した時点で実行環境を凍結するため、service が await せずに
 * 投げた enqueue が止まったまま失われうる。res.end を包んで flush を待ってから返す。
 * service 側の「送出は await しない」という規約はそのまま（待つのはここだけ）。
 *
 * FLUSH_EVENTS_BEFORE_RESPONSE=true のときだけ登録する（ECS ではプロセスが動き続けるので不要）。
 * 設計: docs/spec/minimal-deploy/README.md「Lambda の凍結とイベント送出」
 */
export const flushEventsBeforeResponse = (eventTracker: EventTracker) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const end = res.end.bind(res) as (...args: unknown[]) => Response
    res.end = ((...args: unknown[]) => {
      void waitForFlush(eventTracker)
        .catch((err: unknown) => {
          /**
           * flush は reject しない契約だが、万一 reject してもレスポンスは必ず返す。
           * イベントは副次処理なので warn に留める
           */
          logger.warn("event flush failed before response", {
            error: err instanceof Error ? err.message : String(err),
          })
        })
        .finally(() => end(...args))
      return res
    }) as Response["end"]
    next()
  }

/**
 * テストからだけ使う
 */
export const forTesting = { FLUSH_TIMEOUT_MS, waitForFlush }
