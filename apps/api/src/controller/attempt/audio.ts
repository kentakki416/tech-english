import { Response } from "express"

import { getAttemptAudioPathParamSchema, getAttemptAudioResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageAudioRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"

import { convertAttemptAudioToResponse } from "./mapper"

export class AttemptAudioController {
  constructor(
    private _passageAudioRepository: PassageAudioRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
    private _audioPublicUrlBase: string | null,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(getAttemptAudioPathParamSchema, req.params)

    const result = await service.attempt.getAttemptAudio(
      { attemptId: id, userId: req.userId! },
      { passageAudioRepository: this._passageAudioRepository, readingAttemptRepository: this._readingAttemptRepository },
      { audioPublicUrlBase: this._audioPublicUrlBase },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAttemptAudioResponseSchema, convertAttemptAudioToResponse(result.value))
    return res.status(200).json(response)
  }
}
