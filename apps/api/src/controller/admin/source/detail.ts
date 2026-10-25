import { Request, Response } from "express"

import { getSourcePathParamSchema, getSourceResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceCollectionRunRepository, SourceRepository } from "../../../repository"
import * as service from "../../../service"

import { convertSourceCollectionRunToResponse, convertSourceToResponse } from "./source-mapper"

/**
 * admin のソース詳細取得API（状態別の本文候補件数と、最後の収集の記録つき）
 */
export class AdminSourceDetailController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getSourcePathParamSchema, req.params)

    const result = await service.source.getSourceById(
      id,
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { latestCollectionRun } = result.value
    const response = parseResponse(getSourceResponseSchema, {
      latest_collection_run: latestCollectionRun ? convertSourceCollectionRunToResponse(latestCollectionRun) : null,
      passage_counts: result.value.passageCounts,
      source: convertSourceToResponse(result.value.source),
    })
    return res.status(200).json(response)
  }
}
