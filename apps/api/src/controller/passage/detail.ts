import { Response } from "express"

import { getPassagePathParamSchema, getPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"

import { convertAttributionToResponse } from "./mapper"

/**
 * 開始確認の概要API（本文は含まず、出典と期限内の挑戦中、サーバーの現在時刻を返す）。
 * 公開中でない問題は自分の期限内の挑戦中があるときだけ返し（can_start: false）、無ければ 404
 */
export class PassageDetailController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(getPassagePathParamSchema, req.params)

    const result = await service.passage.getPassageOverview(
      { now: new Date(), passageId: id, userId: req.userId! },
      { passageRepository: this._passageRepository, readingAttemptRepository: this._readingAttemptRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { attribution, canStart, inProgressAttempt, passage, questionCount, serverNow } = result.value
    const response = parseResponse(getPassageResponseSchema, {
      id: passage.id,
      attribution: convertAttributionToResponse(attribution),
      can_start: canStart,
      difficulty: passage.difficulty,
      in_progress_attempt: inProgressAttempt
        ? {
          id: inProgressAttempt.id,
          expires_at: inProgressAttempt.expiresAt.toISOString(),
          started_at: inProgressAttempt.startedAt.toISOString(),
        }
        : null,
      question_count: questionCount,
      server_now: serverNow.toISOString(),
      time_limit_seconds: passage.timeLimitSeconds,
      title: passage.title,
      word_count: passage.wordCount,
    })
    return res.status(200).json(response)
  }
}
