import { Response } from "express"

import { getAttemptAudioPathParamSchema, getAttemptAudioResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageAudioRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"

import { convertAttemptAudioToResponse } from "./mapper"

/**
 * 挑戦の問題の読み上げの音声API（GET /api/attempt/:id/audio）。status が ready ならブロックごとのパートの URL・長さ・単語の時刻、
 * それ以外は status（pending / failed）だけを返す。挑戦の状態は問わない。他人の挑戦・存在しない ID は 404
 */
export class AttemptAudioController {
  constructor(
    private _passageAudioRepository: PassageAudioRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
    /**
     * 音声の URL の base。null（production で未設定）なら音声があっても pending を返す
     */
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
