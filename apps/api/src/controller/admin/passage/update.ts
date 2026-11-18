import { Request, Response } from "express"

import {
  updateAdminPassagePathParamSchema,
  updateAdminPassageRequestSchema,
  updateAdminPassageResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

import { convertAdminPassageDetailToResponse, convertUpdateAdminPassageRequestToInput } from "./convert-detail-to-response"

export class AdminPassageUpdateController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(updateAdminPassagePathParamSchema, req.params)
    const data = parseRequest(updateAdminPassageRequestSchema, req.body)

    const result = await service.adminPassage.updateAdminPassage(id, convertUpdateAdminPassageRequestToInput(data), {
      passageRepository: this._passageRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateAdminPassageResponseSchema, convertAdminPassageDetailToResponse(result.value))
    return res.status(200).json(response)
  }
}
