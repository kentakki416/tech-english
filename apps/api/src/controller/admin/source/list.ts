import { Request, Response } from "express"

import { getSourceListResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceCollectionRunRepository, SourceRepository } from "../../../repository"
import * as service from "../../../service"
import { convertTagToResponse } from "../tag/tag-mapper"

import { convertSourceCollectionRunToResponse } from "./source-mapper"

/**
 * admin のソース一覧取得API（状態別の本文候補件数と、最後の収集の記録つき）
 */
export class AdminSourceListController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const result = await service.source.getSources(
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getSourceListResponseSchema, {
      sources: result.value.map(({ latestCollectionRun, passageCounts, source }) => ({
        id: source.id,
        fetch_type: source.fetchType,
        is_enabled: source.isEnabled,
        kind: source.kind,
        last_collected_at: source.lastCollectedAt?.toISOString() ?? null,
        latest_collection_run: latestCollectionRun ? convertSourceCollectionRunToResponse(latestCollectionRun) : null,
        license_spdx: source.licenseSpdx,
        name: source.name,
        passage_counts: passageCounts,
        /**
         * 取得方法でないほうは null
         */
        repository: source.fetchType === "github_repository" ? source.repository : null,
        site_url: source.fetchType === "website" ? source.siteUrl : null,
        tags: source.tags.map(convertTagToResponse),
      })),
    })
    return res.status(200).json(response)
  }
}
