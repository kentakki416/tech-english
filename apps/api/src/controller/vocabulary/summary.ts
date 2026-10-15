import { Response } from "express"

import { getVocabularySummaryResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository, VocabularyRepository } from "../../repository"
import * as service from "../../service"

import { convertVocabularySummaryToResponse } from "./vocabulary-mapper"

/**
 * 単語帳のトップの数 API（GET /api/vocabulary/summary）。今日の復習・新しい単語・復習中・覚えた単語の数と次の復習の日。
 * ユーザーが存在しなければ 401
 */
export class VocabularySummaryController {
  constructor(
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.vocabulary.getVocabularySummary(
      req.userId!,
      { userRepository: this._userRepository, vocabularyRepository: this._vocabularyRepository },
      { now: new Date() },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getVocabularySummaryResponseSchema, convertVocabularySummaryToResponse(result.value))
    return res.status(200).json(response)
  }
}
