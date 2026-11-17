import type { Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { ApiError } from "@repo/errors"
import { logger } from "@repo/logger"

/**
 * Controller の `if (!result.ok)` ブロックは必ずこのヘルパ経由で返却すること。
 * inline で res.status().json() を書くとログ漏れが発生する。
 */
export const sendError = (req: Request, res: Response, error: ApiError) => {
  logger.warn("API business error", {
    method: req.method,
    path: req.path,
    statusCode: error.statusCode,
    type: error.type,
  })
  const errorResponse: ErrorResponse = {
    ...(error.details === undefined ? {} : { details: error.details }),
    error: error.message,
    status_code: error.statusCode,
  }
  return res.status(error.statusCode).json(errorResponse)
}
