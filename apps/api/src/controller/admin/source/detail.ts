import { Request, Response } from "express"

import { getSourcePathParamSchema, getSourceResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceRepository } from "../../../repository"
import * as service from "../../../service"

import { convertSourceToResponse } from "./source-mapper"

/**
 * admin のソース詳細取得API（状態別の本文候補件数と取得失敗のページつき）
 */
export class AdminSourceDetailController {
  constructor(private _sourceRepository: SourceRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getSourcePathParamSchema, req.params)

    const result = await service.source.getSourceById(id, {
      sourceRepository: this._sourceRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getSourceResponseSchema, {
      passage_counts: result.value.passageCounts,
      source: convertSourceToResponse(result.value.source),
    })
    return res.status(200).json(response)
  }
}
