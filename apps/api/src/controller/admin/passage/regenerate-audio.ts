import { Request, Response } from "express"

import { regenerateAdminPassageAudioPathParamSchema, regenerateAdminPassageAudioResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageAudioRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の読み上げの音声の作り直しの依頼API（ready のときだけ。それ以外の状態・音声の行が無ければ 409）
 */
export class AdminPassageRegenerateAudioController {
  constructor(private _passageAudioRepository: PassageAudioRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(regenerateAdminPassageAudioPathParamSchema, req.params)

    const result = await service.adminPassage.regenerateAdminPassageAudio(id, new Date(), {
      passageAudioRepository: this._passageAudioRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(regenerateAdminPassageAudioResponseSchema, {
      passage_id: result.value.passageId,
      regenerate_requested_at: result.value.regenerateRequestedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
