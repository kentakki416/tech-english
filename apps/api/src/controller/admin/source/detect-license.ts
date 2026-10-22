import { Request, Response } from "express"

import {
  detectSourceLicenseQueryStringSchema,
  detectSourceLicenseResponseSchema,
} from "@repo/api-schema"

import type { IGitHubLicenseClient } from "../../../client/github-license"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import * as service from "../../../service"

/**
 * admin の検出ライセンス取得API（github_repository の登録フォームの初期値用）
 */
export class AdminSourceDetectLicenseController {
  constructor(private _githubLicenseClient: IGitHubLicenseClient) {}

  public async execute(req: Request, res: Response) {
    const { repository } = parseRequest(detectSourceLicenseQueryStringSchema, req.query)

    const result = await service.source.detectRepositoryLicense(repository, {
      githubLicenseClient: this._githubLicenseClient,
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
