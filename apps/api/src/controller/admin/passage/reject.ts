import { Request, Response } from "express"

import {
  rejectAdminPassagePathParamSchema,
  rejectAdminPassageRequestSchema,
  rejectAdminPassageResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の問題却下API（draft のときだけ。理由は必須）
 */
export class AdminPassageRejectController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(rejectAdminPassagePathParamSchema, req.params)
    const { reason } = parseRequest(rejectAdminPassageRequestSchema, req.body)

    const result = await service.adminPassage.rejectAdminPassage(id, reason, new Date(), {
      passageRepository: this._passageRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(rejectAdminPassageResponseSchema, result.value)
    return res.status(200).json(response)
  }
}
