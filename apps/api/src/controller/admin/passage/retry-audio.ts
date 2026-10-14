import { Request, Response } from "express"

import { retryAdminPassageAudioPathParamSchema, retryAdminPassageAudioResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageAudioRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の読み上げの音声の再試行API（failed → pending。それ以外の状態・音声の行が無ければ 409）
 */
export class AdminPassageRetryAudioController {
  constructor(private _passageAudioRepository: PassageAudioRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(retryAdminPassageAudioPathParamSchema, req.params)

    const result = await service.adminPassage.retryAdminPassageAudio(id, { passageAudioRepository: this._passageAudioRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(retryAdminPassageAudioResponseSchema, {
      passage_id: result.value.passageId,
      status: result.value.status,
    })
    return res.status(200).json(response)
  }
}
