import { Request, Response } from "express"

import { getContentSourceListResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { ContentSourceRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin のソース一覧取得API（状態別の本文候補件数と取得失敗のページ数つき）
 */
export class AdminContentSourceListController {
  constructor(private _contentSourceRepository: ContentSourceRepository) {}

  public async execute(req: Request, res: Response) {
    const result = await service.contentSource.getContentSources({
      contentSourceRepository: this._contentSourceRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getContentSourceListResponseSchema, {
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
      })),
    })
    return res.status(200).json(response)
  }
}
