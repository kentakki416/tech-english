import { Request, Response } from "express"

import { suggestSourceQueryStringSchema, suggestSourceResponseSchema } from "@repo/api-schema"

import type { IGitHubRepositoryClient } from "../../../client/github-repository"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import * as service from "../../../service"
import type { SourceWritePolicy } from "../../../service/source-service"

import { convertSourceSuggestionToResponse } from "./source-mapper"

/**
 * admin の URL からのソースの登録の初期値API（登録のフォームの「読み込む」用）。website はローカルでだけ返す
 */
export class AdminSourceSuggestController {
  constructor(
    private _githubRepositoryClient: IGitHubRepositoryClient,
    private _policy: SourceWritePolicy,
  ) {}

  public async execute(req: Request, res: Response) {
    const { url } = parseRequest(suggestSourceQueryStringSchema, req.query)

    const result = await service.source.suggestSourceFromUrl(
      url,
      { githubRepositoryClient: this._githubRepositoryClient },
      this._policy,
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(suggestSourceResponseSchema, convertSourceSuggestionToResponse(result.value))
    return res.status(200).json(response)
  }
}
