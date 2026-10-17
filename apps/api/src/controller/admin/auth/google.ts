import { Request, Response } from "express"

import { adminAuthGoogleRequestSchema, adminAuthGoogleResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { IGoogleOAuthClient } from "../../../client/google-oauth"
import { generateAdminAccessToken, generateAdminRefreshToken } from "../../../lib/admin-jwt"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminRepository, RefreshTokenRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * Google OAuth の認証コードを検証し、admins に登録された email なら admin のトークンを発行する API
 */
export class AdminAuthGoogleController {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminRefreshTokenRepository: RefreshTokenRepository,
    private _googleOAuthClient: IGoogleOAuthClient,
  ) {}

  public async execute(req: Request, res: Response) {
    logger.info("AdminAuthGoogleController: Verifying Google authorization code")

    const { code, redirect_uri: redirectUri } = parseRequest(adminAuthGoogleRequestSchema, req.body)

    const result = await service.adminAuth.authenticateAdminWithGoogle(
      { code, redirectUri },
      {
        adminRepository: this._adminRepository,
        refreshTokenRepository: this._adminRefreshTokenRepository,
      },
      this._googleOAuthClient,
      { generateAccessToken: generateAdminAccessToken, generateRefreshToken: generateAdminRefreshToken },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { accessToken, admin, refreshToken } = result.value

    const response = parseResponse(adminAuthGoogleResponseSchema, {
      access_token: accessToken,
      admin: {
        id: admin.id,
        avatar_url: admin.avatarUrl,
        email: admin.email,
        name: admin.name,
      },
      refresh_token: refreshToken,
    })

    return res.status(200).json(response)
  }
}
