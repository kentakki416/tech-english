import { Response } from "express"

import { getUserGoalResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserGoalRepository } from "../../repository"
import * as service from "../../service"

/**
 * 目標の取得API（GET /api/user/goal）。未設定なら goal は null
 */
export class UserGetGoalController {
  constructor(private _userGoalRepository: UserGoalRepository) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.goal.getUserGoal(req.userId!, { userGoalRepository: this._userGoalRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const goal = result.value
    const response = parseResponse(getUserGoalResponseSchema, {
      goal: goal === null
        ? null
        : {
          goal_text: goal.goalText,
          target_date: goal.targetDate,
          weekly_metric: goal.weeklyMetric,
          weekly_target: goal.weeklyTarget,
        },
    })
    return res.status(200).json(response)
  }
}
