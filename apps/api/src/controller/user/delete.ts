import { Response } from "express"

import { deleteUserRequestSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { verifyRefreshToken } from "../../lib/jwt"
import { parseRequest } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { RefreshTokenRepository, UserRepository } from "../../repository"
import * as service from "../../service"

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
