import { Response } from "express"

import { updateUserRequestSchema, updateUserResponseSchema } from "@repo/api-schema"
import { logger } from "@repo/logger"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository"
import * as service from "../../service"

export class UserUpdateController {
  constructor(private _userRepository: UserRepository) {}

  public async execute(req: AuthRequest, res: Response) {
    logger.info("UserUpdateController: Updating authenticated user", {
      requestedUserId: req.userId,
    })

    const { timezone } = parseRequest(updateUserRequestSchema, req.body)

    const result = await service.user.updateUserTimezone(
      req.userId!,
      { timezone },
      { userRepository: this._userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateUserResponseSchema, {
      id: result.value.id,
      avatar_url: result.value.avatarUrl,
      email: result.value.email,
      name: result.value.name,
      timezone: result.value.timezone,
      created_at: result.value.createdAt.toISOString(),
    })

    return res.status(200).json(response)
  }
}
