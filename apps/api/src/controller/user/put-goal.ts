import { Response } from "express"

import { updateUserGoalRequestSchema, updateUserGoalResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserGoalRepository, UserRepository } from "../../repository"
import * as service from "../../service"

/**
 * 目標の保存API（PUT /api/user/goal）。すべての項目を受け取って upsert し、保存後の値を 200 で返す。
 * 検証エラーは 400、ユーザーが存在しない（削除済みユーザーの access token）なら 401
 */
export class UserPutGoalController {
  constructor(
    private _userGoalRepository: UserGoalRepository,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const body = parseRequest(updateUserGoalRequestSchema, req.body)

    const result = await service.goal.saveUserGoal(
      req.userId!,
      {
        goalText: body.goal_text,
        targetDate: body.target_date,
        weeklyMetric: body.weekly_metric,
        weeklyTarget: body.weekly_target,
      },
      { userGoalRepository: this._userGoalRepository, userRepository: this._userRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateUserGoalResponseSchema, {
      goal: {
        goal_text: result.value.goalText,
        target_date: result.value.targetDate,
        weekly_metric: result.value.weeklyMetric,
        weekly_target: result.value.weeklyTarget,
      },
    })
    return res.status(200).json(response)
  }
}
