import { Request, Response } from "express"

import { unpublishAdminPassagePathParamSchema, unpublishAdminPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の問題を非公開に戻すAPI（published → draft）
 */
export class AdminPassageUnpublishController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(unpublishAdminPassagePathParamSchema, req.params)

    const result = await service.adminPassage.unpublishAdminPassage(id, { passageRepository: this._passageRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(unpublishAdminPassageResponseSchema, result.value)
    return res.status(200).json(response)
  }
}
