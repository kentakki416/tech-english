import { Response } from "express"

import { getUserCalendarQueryStringSchema, getUserCalendarResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { LearningRecordRepository, UserRepository } from "../../repository"
import * as service from "../../service"

/**
 * 学習カレンダーAPI（GET /api/user/calendar?from=&to=）。from〜to の全日の集計と色の段階、ユーザーのタイムゾーンでの today を返す。
 * from / to を省略すると年表示の範囲。片方だけ・from > to・366 日を超える期間は 400、ユーザーが存在しなければ 401
 */
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

    const response = parseResponse(getUserCalendarResponseSchema, {
      days: result.value.days.map((day) => ({
        attempt_count: day.attemptCount,
        card_count: day.cardCount,
        correct_count: day.correctCount,
        date: day.date,
        level: day.level,
        question_count: day.questionCount,
        remembered_count: day.rememberedCount,
        study_seconds: day.studySeconds,
      })),
      from: result.value.from,
      to: result.value.to,
      today: result.value.today,
    })
    return res.status(200).json(response)
  }
}
