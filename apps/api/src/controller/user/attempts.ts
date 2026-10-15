import { Response } from "express"

import { getUserAttemptsQueryStringSchema, getUserAttemptsResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { LearningRecordRepository, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertUserAttemptsToResponse } from "./learning-record-mapper"

/**
 * 提出した挑戦の一覧API（GET /api/user/attempts?date=&cursor=&limit=）。新しい順、cursor ページング。
 * date を指定するとその日（学習した日）だけ。ユーザーが存在しなければ 401
 */
export class UserAttemptsController {
  constructor(
    private _learningRecordRepository: LearningRecordRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getUserAttemptsQueryStringSchema, req.query)

    const result = await service.learningRecord.getUserAttempts(
      req.userId!,
      { cursor: query.cursor, date: query.date, limit: query.limit },
      { learningRecordRepository: this._learningRecordRepository, userRepository: this._userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserAttemptsResponseSchema, convertUserAttemptsToResponse(result.value))
    return res.status(200).json(response)
  }
}
