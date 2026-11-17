import { Response } from "express"

import { getUserCalendarQueryStringSchema, getUserCalendarResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { LearningRecordRepository, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertUserCalendarToResponse } from "./learning-record-mapper"

export class UserCalendarController {
  constructor(
    private _learningRecordRepository: LearningRecordRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getUserCalendarQueryStringSchema, req.query)

    const result = await service.learningRecord.getUserCalendar(
      req.userId!,
      { from: query.from, to: query.to },
      { learningRecordRepository: this._learningRecordRepository, userRepository: this._userRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserCalendarResponseSchema, convertUserCalendarToResponse(result.value))
    return res.status(200).json(response)
  }
}
