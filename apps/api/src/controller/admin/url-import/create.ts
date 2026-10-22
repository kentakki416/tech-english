import { Request, Response } from "express"

import { createUrlImportRequestSchema, createUrlImportResponseSchema } from "@repo/api-schema"

import type { IPageFetcher } from "../../../client/page-fetcher"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceRepository, TransactionRunner, UrlImportPageCacheRepository, UrlImportRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の URL の取り込みAPI。ページを取得・抽出して本文候補として保存し、次の問題の生成で優先する
 */
export class AdminUrlImportCreateController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _urlImportRepository: UrlImportRepository,
    private _urlImportPageCacheRepository: UrlImportPageCacheRepository,
    private _transactionRunner: TransactionRunner,
    private _pageFetcher: IPageFetcher,
  ) {}

  public async execute(req: Request, res: Response) {
    const { url } = parseRequest(createUrlImportRequestSchema, req.body)

    const result = await service.urlImport.importUrl(url, new Date(), {
      sourceRepository: this._sourceRepository,
      transactionRunner: this._transactionRunner,
      urlImportPageCacheRepository: this._urlImportPageCacheRepository,
      urlImportRepository: this._urlImportRepository,
    }, { pageFetcher: this._pageFetcher })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createUrlImportResponseSchema, {
      created_count: result.value.createdCount,
      passages: result.value.passages.map((passage) => ({ id: passage.id, is_new: passage.isNew, title: passage.title })),
      rejected_count: result.value.rejectedCount,
      source_document_id: result.value.sourceDocumentId,
      source_id: result.value.sourceId,
    })
    return res.status(201).json(response)
  }
}
