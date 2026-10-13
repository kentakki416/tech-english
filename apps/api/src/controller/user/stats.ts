import { Response } from "express"

import { getUserStatsResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { LearningRecordRepository, UserGoalRepository, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertAccuracyToResponse, convertLearningRecordAttemptToResponse } from "./learning-record-mapper"

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

    const stats = result.value
    const response = parseResponse(getUserStatsResponseSchema, {
      goal: stats.goal === null
        ? null
        : {
          days_left: stats.goal.daysLeft,
          goal_text: stats.goal.goalText,
          is_weekly_achieved: stats.goal.isWeeklyAchieved,
          target_date: stats.goal.targetDate,
          weekly_metric: stats.goal.weeklyMetric,
          weekly_progress: stats.goal.weeklyProgress,
          weekly_target: stats.goal.weeklyTarget,
        },
      no_assist: convertAccuracyToResponse(stats.noAssist),
      recent_attempts: stats.recentAttempts.map(convertLearningRecordAttemptToResponse),
      streak: {
        current: stats.streak.current,
        longest: stats.streak.longest,
        recent_days: stats.streak.recentDays.map((day) => ({ date: day.date, has_studied: day.hasStudied })),
      },
      today: stats.today,
      totals: {
        ...convertAccuracyToResponse(stats.totals),
        attempt_count: stats.totals.attemptCount,
        passage_count: stats.totals.passageCount,
        study_seconds: stats.totals.studySeconds,
      },
      type_accuracy: stats.typeAccuracy.map((accuracy) => ({ ...convertAccuracyToResponse(accuracy), type: accuracy.type })),
      weakest_question_type: stats.weakestQuestionType,
    })
    return res.status(200).json(response)
  }
}
