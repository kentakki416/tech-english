import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { RequestSchemaMismatchError, ResponseSchemaMismatchError } from "../lib/parse-schema"

export const unhandledExceptionHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    logger.error(
      "Unhandled exception after the response started",
      err instanceof Error ? err : new Error(String(err)),
      {
        method: req.method,
        path: req.path,
      },
    )
    /**
     * 送り終えていれば、クライアントにはもう届いている。既定のエラーハンドラに渡すと接続が切られ、
     * 同じ接続で続くリクエストが失敗するので、何もしない
     */
    if (res.writableEnded) {
      return
    }
    /**
     * 送っている途中なら、もう書き換えられない。Express の既定のエラーハンドラに渡して、接続を切らせる
     */
    return next(err)
  }

  if (err instanceof RequestSchemaMismatchError) {
    logger.warn("Request validation error", {
      issues: err.zodError.issues,
      method: req.method,
      path: req.path,
    })
    const errorResponse: ErrorResponse = {
      error: "Invalid request",
      status_code: 400,
    }
    return res.status(400).json(errorResponse)
  }

  /**
   * レスポンス検証失敗はサーバ起因の不整合 → 500
   */
  if (err instanceof ResponseSchemaMismatchError) {
    logger.error("Response schema mismatch", err, {
      issues: err.zodError.issues,
      method: req.method,
      path: req.path,
    })
    const errorResponse: ErrorResponse = {
      error: "Internal Server Error",
      status_code: 500,
    }
    return res.status(500).json(errorResponse)
  }

  /**
   * Service が外部 API のレスポンスを Zod で検証して投げる素の ZodError も、ここで 500 にする
   */
  logger.error(
    "Unhandled exception",
    err instanceof Error ? err : new Error(String(err)),
    {
      method: req.method,
      path: req.path,
    }
  )

  const errorResponse: ErrorResponse = {
    error: "Internal Server Error",
    status_code: 500,
  }
  res.status(500).json(errorResponse)
}
