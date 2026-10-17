import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"

import { ADMIN_PATH_PREFIX, PUBLIC_PATHS } from "../const"
import { isPathUnderPrefix } from "../lib/is-path-under-prefix"
import { verifyAccessToken } from "../lib/jwt"

export interface AuthRequest extends Request {
  userId?: number
}

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
   * admin の API は、/api/admin の mount の中の adminAuthMiddleware が認証する。
   * ここで一般ユーザーのトークンとして検証すると、admin のトークンが 401 になる。
   * 大文字小文字の違うパス（/API/ADMIN/...）もここで素通りするが、admin の Router に届く前に
   * mount の中の adminAuthMiddleware を必ず通るので、一般ユーザーのトークンでは入れない
   */
  if (isPathUnderPrefix(req.path, ADMIN_PATH_PREFIX)) {
    return next()
  }

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
  if (PUBLIC_PATHS.some(p => isPathUnderPrefix(req.path, p))) {
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