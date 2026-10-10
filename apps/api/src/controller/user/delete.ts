import { Response } from "express"

import { deleteUserRequestSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { verifyRefreshToken } from "../../lib/jwt"
import { parseRequest } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { RefreshTokenRepository, UserRepository } from "../../repository"
import * as service from "../../service"

/**
 * DELETE /api/user
 *
 * 認証中ユーザー自身のアカウントを削除する。req.userId は authMiddleware が確定済みの前提。
 * confirmation が "delete my account" と一致しないリクエストは parseRequest が 400 にする（Service には届かない）。
 * 成功は 204（ボディなし）
 */
export class UserDeleteController {
  constructor(
    private _userRepository: UserRepository,
    private _refreshTokenRepository: RefreshTokenRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    logger.info("UserDeleteController: Deleting authenticated user", {
      requestedUserId: req.userId,
    })

    const { refresh_token: refreshToken } = parseRequest(deleteUserRequestSchema, req.body)

    const result = await service.user.deleteUser(
      req.userId!,
      { refreshToken },
      { refreshTokenRepository: this._refreshTokenRepository, userRepository: this._userRepository },
      (token) => {
        const payload = verifyRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.userId } : null
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    return res.status(204).end()
  }
}
