import { Response } from "express"

import { updateUserGoalRequestSchema, updateUserGoalResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserGoalRepository, UserRepository } from "../../repository"
import * as service from "../../service"

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
