import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"
import { logContext, logger } from "@repo/logger"

import { ADMIN_PUBLIC_PATHS } from "../const"
import { verifyAdminAccessToken } from "../lib/admin-jwt"

export interface AdminAuthRequest extends Request {
  adminId?: number
}

/**
 * mount からの相対パスが ADMIN_PUBLIC_PATHS のどれかと完全に一致するか。
 * 大文字小文字と末尾の `/` は区別しない（Express 5 の Router もこれらを区別せずにルートへ届けるため）。
 * 下の階層は公開しない（`/auth/google/x` は公開のパスではない）
 */
const isAdminPublicPath = (path: string): boolean => {
  const normalizedPath = path.toLowerCase().replace(/\/$/, "")
  return ADMIN_PUBLIC_PATHS.some(p => p.toLowerCase() === normalizedPath)
}

/**
 * 拒否したリクエストの method と path を warn に残して 401 を返す。トークンはログに出さない
 */
const rejectAdminRequest = (req: Request, res: Response, error: string) => {
  /**
   * mount の中の req.path は mount からの相対なので、baseUrl を前に付ける（クエリは含めない）
   */
  logger.warn("Admin authentication failed", { method: req.method, path: `${req.baseUrl}${req.path}` })
  const errorResponse: ErrorResponse = { error, status_code: 401 }
  return res.status(401).json(errorResponse)
}

/**
 * admin の Access Token（Authorization: Bearer）で認証する。
 *
 * ここでの req.path は mount からの相対（/auth/google など）。
 */
export const adminAuthMiddleware = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
  if (isAdminPublicPath(req.path)) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return rejectAdminRequest(req, res, "No token provided")
  }

  const payload = verifyAdminAccessToken(authHeader.substring(7))
  if (!payload) {
    return rejectAdminRequest(req, res, "Invalid or expired token")
  }

  req.adminId = payload.adminId
  /**
   * requestLogger は全体に掛かっていて、ここより先に動く（userId しか積めない）。
   * 以降のログに adminId が付くよう、今のログのコンテキストに足して続きを動かす
   */
  return logContext.run({ ...logContext.getStore(), adminId: payload.adminId }, () => next())
}
