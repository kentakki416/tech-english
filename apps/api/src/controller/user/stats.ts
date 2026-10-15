import { Response } from "express"

import { getUserStatsResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { LearningRecordRepository, UserGoalRepository, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertUserStatsToResponse } from "./learning-record-mapper"

/**
 * マイページの統計API（GET /api/user/stats）。連続学習日数・目標の進捗・累計・設問の種類別の正答率・最近の挑戦を返す。
 * ユーザーが存在しない（削除済みユーザーの access token）なら 401
 */
export class UserStatsController {
  constructor(
    private _learningRecordRepository: LearningRecordRepository,
    private _userGoalRepository: UserGoalRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.learningRecord.getUserStats(
      req.userId!,
      {
        learningRecordRepository: this._learningRecordRepository,
        userGoalRepository: this._userGoalRepository,
        userRepository: this._userRepository,
      },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getUserStatsResponseSchema, convertUserStatsToResponse(result.value))
    return res.status(200).json(response)
  }
}
