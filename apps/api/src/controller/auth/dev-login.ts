import { Request, Response } from "express"

import {
  authDevLoginRequestSchema,
  authDevLoginResponseSchema,
} from "@repo/api-schema"
import { logger } from "@repo/logger"

import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { RefreshTokenRepository, UserRepository } from "../../repository"
import * as service from "../../service"

export class AuthDevLoginController {
  constructor(
    private _userRepository: UserRepository,
    private _refreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    /**
     * production では index.ts がこの Controller を生成しないが、誤って登録されても動かないように、ここでも 404 を返す
     */
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not Found", status_code: 404 })
    }

    logger.info("AuthDevLoginController: dev-login")

    const { email } = parseRequest(authDevLoginRequestSchema, req.body)

    const result = await service.auth.loginAsDevUser(
      { email },
      {
        refreshTokenRepository: this._refreshTokenRepository,
        userRepository: this._userRepository,
      },
      { generateAccessToken, generateRefreshToken },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { accessToken, refreshToken, user } = result.value

    const response = parseResponse(authDevLoginResponseSchema, {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        created_at: user.createdAt.toISOString(),
        email: user.email,
        id: user.id,
        name: user.name,
      },
    })

    return res.status(200).json(response)
  }
}
