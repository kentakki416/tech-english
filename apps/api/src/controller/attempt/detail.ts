import { Response } from "express"

import { getAttemptPathParamSchema, getAttemptResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"

import { convertExpiredAttemptToResponse, convertInProgressAttemptToResponse, convertSubmittedAttemptToResponse } from "./mapper"

/**
 * 自分の挑戦の取得API（GET /api/attempt/:id）。in_progress は開始時と同じ形、submitted は提出 API と同じ結果の形、
 * expired は概要だけを返す。他人の挑戦・存在しない ID は 404
 */
export class AttemptDetailController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(getAttemptPathParamSchema, req.params)

    const result = await service.attempt.getAttempt(
      { attemptId: id, now: new Date(), userId: req.userId! },
      { passageRepository: this._passageRepository, readingAttemptRepository: this._readingAttemptRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const view = result.value
    const response = parseResponse(
      getAttemptResponseSchema,
      view.status === "in_progress"
        ? convertInProgressAttemptToResponse(view)
        : view.status === "submitted"
          ? convertSubmittedAttemptToResponse(view)
          : convertExpiredAttemptToResponse(view),
    )
    return res.status(200).json(response)
  }
}
