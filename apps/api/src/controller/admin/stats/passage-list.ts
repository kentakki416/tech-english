import { Request, Response } from "express"

import { getAdminPassageStatsListQueryStringSchema, getAdminPassageStatsListResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { AdminStatsRepository } from "../../../repository"
import * as service from "../../../service"

import { convertPassageStatsToResponse } from "./convert-stats-to-response"

/**
 * admin のダッシュボードの問題ごとの成績API（並べ替え・タイトルの絞り込み・offset のページ分け）
 */
export class AdminPassageStatsListController {
  constructor(private _adminStatsRepository: AdminStatsRepository) {}

  public async execute(req: Request, res: Response) {
    const query = parseRequest(getAdminPassageStatsListQueryStringSchema, req.query)

    const result = await service.adminStats.getAdminPassageStatsList(
      query,
      { adminStatsRepository: this._adminStatsRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminPassageStatsListResponseSchema, {
      limit: result.value.limit,
      page: result.value.page,
      passages: result.value.items.map(convertPassageStatsToResponse),
      total: result.value.total,
    })
    return res.status(200).json(response)
  }
}
