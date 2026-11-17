import { NextFunction, Request, Response } from "express"

import { ErrorResponse } from "@repo/api-schema"

import { ADMIN_PATH_PREFIX, PUBLIC_PATHS } from "../const"
import { isPathUnderPrefix } from "../lib/is-path-under-prefix"
import { verifyAccessToken } from "../lib/jwt"

export interface AuthRequest extends Request {
  /**
   * PUBLIC_PATHS に無いパスでは、authMiddleware を通った時点で必ずある
   */
  userId?: number
}

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
   * 公開パスでも、トークンが付いていれば `req.userId` を埋める（無くても 401 にしない）。
   * ここで早期 return すると、有効なトークンを渡しても userId が入らず、行動イベントが記録されない
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