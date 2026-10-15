import { Request, Response } from "express"

import { getAdminStatsOverviewQueryStringSchema, getAdminStatsOverviewResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminStatsRepository } from "../../../repository"
import * as service from "../../../service"

import { convertAssistRatesToResponse } from "./convert-stats-to-response"

/**
 * admin のダッシュボードの全体の利用状況API（数字と推移）
 */
export class AdminStatsOverviewController {
  constructor(private _adminStatsRepository: AdminStatsRepository) {}

  public async execute(req: Request, res: Response) {
    const { period } = parseRequest(getAdminStatsOverviewQueryStringSchema, req.query)

    const result = await service.adminStats.getAdminStatsOverview(
      period,
      { adminStatsRepository: this._adminStatsRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const overview = result.value
    const response = parseResponse(getAdminStatsOverviewResponseSchema, {
      active_users: overview.activeUsers,
      assist_rates: convertAssistRatesToResponse(overview.assistRates),
      correct_rate: overview.correctRate,
      from: overview.fromDate,
      new_users: overview.newUsers,
      period: overview.period,
      series: {
        bucket: overview.series.bucket,
        points: overview.series.points.map((point) => ({
          active_users: point.activeUsers,
          date: point.date,
          new_users: point.newUsers,
          solved_attempts: point.solvedAttempts,
        })),
      },
      solved_attempts: overview.solvedAttempts,
      solved_users: overview.solvedUsers,
      to: overview.toDate,
      total_users: overview.totalUsers,
    })
    return res.status(200).json(response)
  }
}
