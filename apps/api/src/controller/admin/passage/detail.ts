import { Request, Response } from "express"

import { getAdminPassagePathParamSchema, getAdminPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

import { convertAdminPassageDetailToResponse } from "./convert-detail-to-response"

export class AdminPassageDetailController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getAdminPassagePathParamSchema, req.params)

    const result = await service.adminPassage.getAdminPassageDetail(id, { passageRepository: this._passageRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminPassageResponseSchema, convertAdminPassageDetailToResponse(result.value))
    return res.status(200).json(response)
  }
}
