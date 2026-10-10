import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"

import { PUBLIC_PATHS } from "../const"
import { verifyAccessToken } from "../lib/jwt"

export interface AuthRequest extends Request {
  userId?: number
}

/**
 * 完全一致 or path セグメント境界での prefix 一致をチェックする。
 *
 * 単純な `path.startsWith(p)` は `/api/auth/github` が `/api/auth/github-foo` も
 * 通してしまうため、登録されたエンドポイントと意図しないパスが衝突するリスクがある。
 * `/` 区切り (= path segment 境界) で一致するもののみ通す。
 *
 * 例 (p = "/api/auth/github"):
 * - "/api/auth/github"          → true (完全一致)
 * - "/api/auth/github/callback" → true (segment 境界の prefix)
 * - "/api/auth/github-foo"      → false (segment 境界ではない)
 */
const matchesPathPrefix = (path: string, p: string): boolean =>
  path === p || path.startsWith(`${p}/`)

/**
 * Authorization ヘッダから userId を取り出す。取り出せなければ undefined。
 *
 * **エラーを投げない。** 公開パスでの optional 認証に使うため、
 * トークンが無い / 不正 / 期限切れのいずれも「未ログイン」として扱う。
 */
const tryResolveUserId = (authHeader: string | undefined): number | undefined => {
  if (!authHeader?.startsWith("Bearer ")) return undefined
  try {
    return verifyAccessToken(authHeader.substring(7))?.userId
  } catch {
    return undefined
  }
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  /**
   * 公開パスは認証不要。
   *
   * ただし **トークンが付いていれば読んで `req.userId` を埋める**（optional 認証）。
   * 無くても 401 にはしないので未認証アクセスの挙動は変わらない。
   *
   * こうしているのは、公開パスでも「ログイン済みなら誰がやったか」を記録したい
   * ケースがあるため（行動イベントの `user_id`）。ここで早期 return すると
   * 有効なトークンを渡しても userId が入らず、イベントが永久に記録されない。
   */
  if (PUBLIC_PATHS.some(p => matchesPathPrefix(req.path, p))) {
    const optionalUserId = tryResolveUserId(req.headers.authorization)
    if (optionalUserId !== undefined) {
      req.userId = optionalUserId
    }
    return next()
  }

  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const errorResponse: ErrorResponse = {
        error: "No token provided",
        status_code: 401,
      }
      return res.status(401).json(errorResponse)
    }

    const token = authHeader.substring(7)
    const payload = verifyAccessToken(token)

    if (!payload) {
      const errorResponse: ErrorResponse = {
        error: "Invalid or expired token",
        status_code: 401,
      }
      return res.status(401).json(errorResponse)
    }

    req.userId = payload.userId
    return next()
  } catch {
    const errorResponse: ErrorResponse = {
      error: "Authentication failed",
      status_code: 500,
    }
    res.status(500).json(errorResponse)
  }
}