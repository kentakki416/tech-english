import { Request, Response } from "express"

import { getContentSourcePathParamSchema, getContentSourceResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { ContentSourceRepository } from "../../../repository"
import * as service from "../../../service"

import { convertContentSourceToResponse } from "./content-source-mapper"

/**
 * admin のソース詳細取得API（状態別の本文候補件数と取得失敗のページつき）
 */
export class AdminContentSourceDetailController {
  constructor(private _contentSourceRepository: ContentSourceRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getContentSourcePathParamSchema, req.params)

    const result = await service.contentSource.getContentSourceById(id, {
      contentSourceRepository: this._contentSourceRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getContentSourceResponseSchema, {
      failed_pages: result.value.failedPages.map((page) => ({
        http_status: page.httpStatus,
        path: page.path,
      })),
      passage_counts: result.value.passageCounts,
      source: convertContentSourceToResponse(result.value.source),
    })
    return res.status(200).json(response)
  }
}
