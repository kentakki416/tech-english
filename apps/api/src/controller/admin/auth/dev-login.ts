import { Request, Response } from "express"

import { adminAuthDevLoginRequestSchema, adminAuthDevLoginResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { generateAdminAccessToken, generateAdminRefreshToken } from "../../../lib/admin-jwt"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminRepository, RefreshTokenRepository } from "../../../repository"
import * as service from "../../../service"

export class AdminAuthDevLoginController {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminRefreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    /**
     * production では index.ts がこの Controller を生成しないが、誤って登録されても動かないように、ここでも 404 を返す
     */
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not Found", status_code: 404 })
    }

    logger.info("AdminAuthDevLoginController: dev-login")

    const { email } = parseRequest(adminAuthDevLoginRequestSchema, req.body)

    const result = await service.adminAuth.loginAsDevAdmin(
      { email },
      {
        adminRepository: this._adminRepository,
        refreshTokenRepository: this._adminRefreshTokenRepository,
      },
      { generateAccessToken: generateAdminAccessToken, generateRefreshToken: generateAdminRefreshToken },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { accessToken, admin, refreshToken } = result.value

    const response = parseResponse(adminAuthDevLoginResponseSchema, {
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
