import { Request, Response } from "express"

import {
  detectContentSourceLicenseQueryStringSchema,
  detectContentSourceLicenseResponseSchema,
} from "@repo/api-schema"

import type { IGitHubLicenseClient } from "../../../client/github-license"
import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import * as service from "../../../service"

/**
 * admin の検出ライセンス取得API（github_repository の登録フォームの初期値用）
 */
export class AdminContentSourceDetectLicenseController {
  constructor(private _githubLicenseClient: IGitHubLicenseClient) {}

  public async execute(req: Request, res: Response) {
    const { repository } = parseRequest(detectContentSourceLicenseQueryStringSchema, req.query)

    const result = await service.contentSource.detectRepositoryLicense(repository, {
      githubLicenseClient: this._githubLicenseClient,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(detectContentSourceLicenseResponseSchema, {
      is_allowed: result.value.isAllowed,
      license_spdx: result.value.licenseSpdx,
    })
    return res.status(200).json(response)
  }
}
