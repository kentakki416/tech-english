import { Request, Response } from "express"

import { getSourceListResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceRepository } from "../../../repository"
import * as service from "../../../service"
import { convertTagToResponse } from "../tag/tag-mapper"

/**
 * admin のソース一覧取得API（状態別の本文候補件数と取得失敗のページ数つき）
 */
export class AdminSourceListController {
  constructor(private _sourceRepository: SourceRepository) {}

  public async execute(req: Request, res: Response) {
    const result = await service.source.getSources({
      sourceRepository: this._sourceRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getSourceListResponseSchema, {
      sources: result.value.map(({ failedPageCount, passageCounts, source }) => ({
        id: source.id,
        failed_page_count: failedPageCount,
        fetch_type: source.fetchType,
        is_enabled: source.isEnabled,
        kind: source.kind,
        last_collected_at: source.lastCollectedAt?.toISOString() ?? null,
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
