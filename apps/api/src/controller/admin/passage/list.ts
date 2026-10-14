import { Request, Response } from "express"

import { getAdminPassageListQueryStringSchema, getAdminPassageListResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

import { convertAdminPassageListItemToResponse } from "./convert-detail-to-response"

/**
 * admin の問題一覧API（状態・ソース・要確認の絞り込み、cursor ページング、状態ごとの件数）
 */
export class AdminPassageListController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const query = parseRequest(getAdminPassageListQueryStringSchema, req.query)

    const result = await service.adminPassage.getAdminPassageList(
      {
        cursor: query.cursor,
        limit: query.limit,
        needsAttention: query.needs_attention,
        sourceId: query.source_id,
        status: query.status,
      },
      { passageRepository: this._passageRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminPassageListResponseSchema, {
      has_more: result.value.hasMore,
      next_cursor: result.value.nextCursor,
      passages: result.value.items.map(convertAdminPassageListItemToResponse),
      status_counts: result.value.statusCounts,
    })
    return res.status(200).json(response)
  }
}
