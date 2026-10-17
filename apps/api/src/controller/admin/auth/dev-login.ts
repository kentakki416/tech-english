import { Request, Response } from "express"

import { adminAuthDevLoginRequestSchema, adminAuthDevLoginResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { generateAdminAccessToken, generateAdminRefreshToken } from "../../../lib/admin-jwt"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminRepository, RefreshTokenRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * 開発環境専用の admin ログイン API
 *
 * seed で投入済みの admin（admin@dev.local）の email を受け取り、Google 認証と同じ形のトークンを発行する。
 *
 * 多重ガード（一般ユーザーの dev-login と同じ）:
 * 1. index.ts で本番時はインスタンス化しない
 * 2. admin-router.ts で controller 未指定ならルート登録しない
 * 3. ここでも NODE_ENV を見て 404 を返す
 * 4. const/index.ts で本番時は ADMIN_PUBLIC_PATHS に含めない
 */
export class AdminAuthDevLoginController {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminRefreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: Request, res: Response) {
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
