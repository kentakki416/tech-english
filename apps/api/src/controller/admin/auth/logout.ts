import { Request, Response } from "express"

import { adminAuthLogoutRequestSchema, adminAuthLogoutResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { verifyAdminRefreshToken } from "../../../lib/admin-jwt"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { RefreshTokenRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の Refresh Token を無効化してログアウトする API
 */
export class AdminAuthLogoutController {
  constructor(private _adminRefreshTokenRepository: RefreshTokenRepository) {}

  public async execute(req: Request, res: Response) {
    logger.info("AdminAuthLogoutController: Logging out")

    const { refresh_token: refreshToken } = parseRequest(adminAuthLogoutRequestSchema, req.body)

    const result = await service.auth.logout(
      { refreshToken },
      { refreshTokenRepository: this._adminRefreshTokenRepository },
      (token) => {
        const payload = verifyAdminRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.adminId } : null
      }
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    return res.status(200).json(parseResponse(adminAuthLogoutResponseSchema, { message: "OK" }))
  }
}
