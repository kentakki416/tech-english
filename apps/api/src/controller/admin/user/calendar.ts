import { Request, Response } from "express"

import { getAdminUserCalendarQueryStringSchema, getAdminUserCalendarResponseSchema, getAdminUserPathParamSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { LearningRecordRepository, UserRepository } from "../../../repository"
import * as service from "../../../service"
import { convertUserCalendarToResponse } from "../../user/learning-record-mapper"

/**
 * admin のユーザーの学習カレンダーAPI（GET /api/user/calendar と同じ形）。ユーザーが居なければ 404
 */
export class AdminUserCalendarController {
  constructor(
    private _learningRecordRepository: LearningRecordRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getAdminUserPathParamSchema, req.params)
    const query = parseRequest(getAdminUserCalendarQueryStringSchema, req.query)

    const result = await service.adminUser.getAdminUserCalendar(
      id,
      { from: query.from, to: query.to },
      { learningRecordRepository: this._learningRecordRepository, userRepository: this._userRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminUserCalendarResponseSchema, convertUserCalendarToResponse(result.value))
    return res.status(200).json(response)
  }
}
