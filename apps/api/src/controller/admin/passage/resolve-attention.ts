import { Request, Response } from "express"

import {
  resolveAdminPassageAttentionPathParamSchema,
  resolveAdminPassageAttentionResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の要確認の解除API（needs_attention = false、attention_reasons = []。状態は問わず、解除済みでも 200）
 */
export class AdminPassageResolveAttentionController {
  constructor(private _passageRepository: PassageRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(resolveAdminPassageAttentionPathParamSchema, req.params)

    const result = await service.adminPassage.resolveAdminPassageAttention(id, { passageRepository: this._passageRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(resolveAdminPassageAttentionResponseSchema, {
      id: result.value.id,
      attention_reasons: result.value.attentionReasons,
      needs_attention: result.value.needsAttention,
    })
    return res.status(200).json(response)
  }
}
