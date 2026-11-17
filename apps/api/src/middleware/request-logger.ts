import crypto from "crypto"

import type { Request, Response, NextFunction } from "express"

import { logger, logContext } from "@repo/logger"

import { LOG_EXCLUDE_PATHS } from "../const"

import type { AdminAuthRequest } from "./admin-auth"
import type { AuthRequest } from "./auth"

/**
 * - ステータスコードによる level 分岐はしない（エラー詳細は出さず status / latency / path のみ）
 * - エラーの内容ログは sendError ヘルパ（業務 4xx）と unhandled-exception-handler（想定外例外）の責務
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  if (LOG_EXCLUDE_PATHS.some(path => path === req.path)) {
    return next()
  }

  const startTime = Date.now()
  const requestId = crypto.randomUUID()
  const authReq = req as AuthRequest
  const userId = authReq.userId || "unauthenticated"

  logContext.run({ requestId, userId }, () => {
    logger.info("API Request Received", {
      duration: 0,
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get("user-agent") || "unknown",
    })

    res.on("finish", () => {
      const duration = Date.now() - startTime
      logger.info("API Request Completed", {
        /**
         * adminAuthMiddleware はこのミドルウェアより後に動くので、終わった時点で読む
         */
        adminId: (req as AdminAuthRequest).adminId,
        duration,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      })
    })

    res.on("close", () => {
      if (!res.writableEnded) {
        const duration = Date.now() - startTime

        logger.warn("API Request Closed Unexpectedly", {
          duration,
          method: req.method,
          path: req.path,
        })
      }
    })

    next()
  })
}
