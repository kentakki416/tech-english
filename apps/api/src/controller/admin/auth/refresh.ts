import { Request, Response } from "express"

import { adminAuthRefreshRequestSchema, adminAuthRefreshResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
} from "../../../lib/admin-jwt"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminRepository, RefreshTokenRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の Refresh Token をローテーションして新しい Access/Refresh Token を発行する API
 */
export class AdminAuthRefreshController {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminRefreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    logger.info("AdminAuthRefreshController: Rotating refresh token")

    const { refresh_token: refreshToken } = parseRequest(adminAuthRefreshRequestSchema, req.body)

    const result = await service.auth.refreshTokens(
      { refreshToken },
      { refreshTokenRepository: this._adminRefreshTokenRepository, tokenOwnerRepository: this._adminRepository },
      (token) => {
        const payload = verifyAdminRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.adminId } : null
      },
      { generateAccessToken: generateAdminAccessToken, generateRefreshToken: generateAdminRefreshToken },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(adminAuthRefreshResponseSchema, {
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
    })

    return res.status(200).json(response)
  }
}
