import { Request, Response } from "express"

import { regenerateAdminPassagePathParamSchema, regenerateAdminPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の問題再生成API（draft / rejected / failed → collected。挑戦が 1 件でもあれば 409）
 */
export class AdminPassageRegenerateController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(regenerateAdminPassagePathParamSchema, req.params)

    const result = await service.adminPassage.regenerateAdminPassage(id, { passageRepository: this._passageRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(regenerateAdminPassageResponseSchema, result.value)
    return res.status(200).json(response)
  }
}
