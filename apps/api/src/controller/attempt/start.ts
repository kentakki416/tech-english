import { Response } from "express"

import { startAttemptPathParamSchema, startAttemptResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertInProgressAttemptToResponse } from "./mapper"

/**
 * 挑戦の開始API（POST /api/passage/:id/attempt）。新しく始めたら 201、期限内の挑戦中を再開したら 200。
 * 本文・和訳・用語集・設問（正解なし）・出典・サーバーの現在時刻を返す
 */
export class AttemptStartController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(startAttemptPathParamSchema, req.params)

    const result = await service.attempt.startAttempt(
      { now: new Date(), passageId: id, userId: req.userId! },
      {
        passageRepository: this._passageRepository,
        readingAttemptRepository: this._readingAttemptRepository,
        userRepository: this._userRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(startAttemptResponseSchema, convertInProgressAttemptToResponse(result.value.view))
    return res.status(result.value.isCreated ? 201 : 200).json(response)
  }
}
