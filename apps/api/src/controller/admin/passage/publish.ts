import { Request, Response } from "express"

import { publishAdminPassagePathParamSchema, publishAdminPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { PassageAudioRepository, PassageRepository, TransactionRunner } from "../../../repository"
import * as service from "../../../service"

/**
 * admin の問題公開API（draft のときだけ）。公開の条件を満たさなければ 400 と details。読み上げの音声が failed なら pending に戻す
 */
export class AdminPassagePublishController {
  constructor(
    private _passageRepository: PassageRepository,
    private _passageAudioRepository: PassageAudioRepository,
    private _transactionRunner: TransactionRunner,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(publishAdminPassagePathParamSchema, req.params)

    const result = await service.adminPassage.publishAdminPassage(id, new Date(), {
      passageAudioRepository: this._passageAudioRepository,
      passageRepository: this._passageRepository,
      transactionRunner: this._transactionRunner,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(publishAdminPassageResponseSchema, result.value)
    return res.status(200).json(response)
  }
}
