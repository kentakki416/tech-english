import { Request, Response } from "express"

import { restoreAdminPassagePathParamSchema, restoreAdminPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の却下の取り消しAPI（rejected → 設問があれば draft、無ければ collected）
 */
export class AdminPassageRestoreController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(restoreAdminPassagePathParamSchema, req.params)

    const result = await service.adminPassage.restoreAdminPassage(id, { passageRepository: this._passageRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(restoreAdminPassageResponseSchema, result.value)
    return res.status(200).json(response)
  }
}
