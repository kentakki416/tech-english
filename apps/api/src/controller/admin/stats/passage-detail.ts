import { Request, Response } from "express"

import {
  getAdminPassageStatsPathParamSchema,
  getAdminPassageStatsQueryStringSchema,
  getAdminPassageStatsResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminStatsRepository } from "../../../repository"
import * as service from "../../../service"

import { convertPassageStatsToResponse } from "./convert-stats-to-response"

/**
 * admin の問題の分析API（問題の数字と、設問ごとの正答率・選択肢の割合・要確認の印）。問題が無ければ 404
 */
export class AdminPassageStatsDetailController {
  constructor(private _adminStatsRepository: AdminStatsRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getAdminPassageStatsPathParamSchema, req.params)
    const { period } = parseRequest(getAdminPassageStatsQueryStringSchema, req.query)

    const result = await service.adminStats.getAdminPassageStats(
      id,
      period,
      { adminStatsRepository: this._adminStatsRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminPassageStatsResponseSchema, {
      passage: convertPassageStatsToResponse(result.value.passage),
      period: result.value.period,
      questions: result.value.questions.map((question) => ({
        id: question.id,
        answer_count: question.answerCount,
        choice_rates: question.choiceRates,
        choices: question.choices,
        correct_choice_index: question.correctChoiceIndex,
        correct_rate: question.correctRate,
        misleading_choice_indexes: question.misleadingChoiceIndexes,
        needs_review: question.needsReview,
        order_index: question.orderIndex,
        prompt: question.prompt,
        type: question.type,
        unanswered_rate: question.unansweredRate,
      })),
    })
    return res.status(200).json(response)
  }
}
