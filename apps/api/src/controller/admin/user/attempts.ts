import { Request, Response } from "express"

import { getAdminUserAttemptsQueryStringSchema, getAdminUserAttemptsResponseSchema, getAdminUserAttemptsPathParamSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { LearningRecordRepository, UserRepository } from "../../../repository"
import * as service from "../../../service"
import { convertUserAttemptsToResponse } from "../../user/learning-record-mapper"

/**
 * admin のユーザーの学習履歴API（GET /api/user/attempts と同じ形。新しい順、cursor ページング）。ユーザーが居なければ 404
 */
export class AdminUserAttemptsController {
  constructor(
    private _learningRecordRepository: LearningRecordRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getAdminUserAttemptsPathParamSchema, req.params)
    const query = parseRequest(getAdminUserAttemptsQueryStringSchema, req.query)

    const result = await service.adminUser.getAdminUserAttempts(
      id,
      { cursor: query.cursor, date: query.date, limit: query.limit },
      { learningRecordRepository: this._learningRecordRepository, userRepository: this._userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminUserAttemptsResponseSchema, convertUserAttemptsToResponse(result.value))
    return res.status(200).json(response)
  }
}
