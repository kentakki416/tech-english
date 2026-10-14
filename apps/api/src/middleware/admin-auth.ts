import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { env } from "../env"
import { isAdminTokenValid } from "../lib/admin-token"

/**
 * admin のサーバー側が付けるヘッダ（Express の req.header は大文字小文字を区別しない）
 */
export const ADMIN_TOKEN_HEADER = "x-admin-token"

/**
 * /api/admin/* の認証。admin-router のすべてのルートの前に通す。
 *
 * ユーザーの JWT は見ない（/api/admin は PUBLIC_PATHS に入れてあり、authMiddleware は素通りする）。
 * ヘッダが無い・値が違う・空文字はすべて同じ 401 にし、どれが原因かは返さない。
 * トークンの値はログに出さない。
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isAdminTokenValid(req.header(ADMIN_TOKEN_HEADER), env.ADMIN_API_TOKEN)) return next()

  logger.warn("Invalid admin token", {
    method: req.method,
    /**
     * router 内の req.path はマウント先からの相対パスなので baseUrl を前に付ける（クエリは含めない）
     */
    path: `${req.baseUrl}${req.path}`,
  })
  const errorResponse: ErrorResponse = {
    error: "Invalid admin token",
    status_code: 401,
  }
  return res.status(401).json(errorResponse)
}
