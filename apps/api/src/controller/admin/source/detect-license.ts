import { Request, Response } from "express"

import {
  detectSourceLicenseQueryStringSchema,
  detectSourceLicenseResponseSchema,
} from "@repo/api-schema"

import type { IGitHubRepositoryClient } from "../../../client/github-repository"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import * as service from "../../../service"

/**
 * admin の検出ライセンス取得API（github_repository の編集フォームの「ライセンスを検出」用）
 */
export class AdminSourceDetectLicenseController {
  constructor(private _githubRepositoryClient: IGitHubRepositoryClient) {}

  public async execute(req: Request, res: Response) {
    const { repository } = parseRequest(detectSourceLicenseQueryStringSchema, req.query)

    const result = await service.source.detectRepositoryLicense(repository, {
      githubRepositoryClient: this._githubRepositoryClient,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(detectSourceLicenseResponseSchema, {
      is_allowed: result.value.isAllowed,
      license_spdx: result.value.licenseSpdx,
      license_url: result.value.licenseUrl,
    })
    return res.status(200).json(response)
  }
}
