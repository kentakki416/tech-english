import { Request, Response } from "express"

import { previewUrlImportRequestSchema, previewUrlImportResponseSchema } from "@repo/api-schema"

import type { IPageFetcher } from "../../../client/page-fetcher"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { ContentSourceRepository, UrlImportPageCacheRepository, UrlImportRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の URL の取り込みの確認API。ページを取得・抽出して、塊ごとに保存したときにどうなるかを返す（DB には書かない）
 */
export class AdminUrlImportPreviewController {
  constructor(
    private _contentSourceRepository: ContentSourceRepository,
    private _urlImportRepository: UrlImportRepository,
    private _urlImportPageCacheRepository: UrlImportPageCacheRepository,
    private _pageFetcher: IPageFetcher,
  ) {}

  public async execute(req: Request, res: Response) {
    const { url } = parseRequest(previewUrlImportRequestSchema, req.body)

    const result = await service.urlImport.previewUrlImport(url, new Date(), {
      contentSourceRepository: this._contentSourceRepository,
      urlImportPageCacheRepository: this._urlImportPageCacheRepository,
      urlImportRepository: this._urlImportRepository,
    }, { pageFetcher: this._pageFetcher })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { chunks, page, source } = result.value
    const response = parseResponse(previewUrlImportResponseSchema, {
      chunks: chunks.map((chunk) => ({
        excerpt: chunk.excerpt,
        reject_reasons: chunk.rejectReasons,
        same_content_passage: chunk.sameContentPassage,
        status: chunk.status,
        title: chunk.title,
        word_count: chunk.wordCount,
      })),
      page: { path: page.path, title: page.title, url: page.normalizedUrl, word_count: page.wordCount },
      source: { id: source.id, license_spdx: source.licenseSpdx, name: source.name },
    })
    return res.status(200).json(response)
  }
}
