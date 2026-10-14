import { Response } from "express"

import { getVocabularySessionResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository, VocabularyRepository } from "../../repository"
import * as service from "../../service"

/**
 * 単語帳の 1 回分のカード API（GET /api/vocabulary/session）。今日の復習 → 新しい単語の順に最大 10 枚。
 * 読み取りだけで何も書き込まない。ユーザーが存在しなければ 401
 */
export class VocabularySessionController {
  constructor(
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.vocabulary.getVocabularySession(
      req.userId!,
      { userRepository: this._userRepository, vocabularyRepository: this._vocabularyRepository },
      { now: new Date() },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getVocabularySessionResponseSchema, {
      cards: result.value.cards.map((card) => ({
        lemma: card.lemma,
        meaning_ja: card.meaningJa,
        meaning_source: card.meaningSource,
        note_ja: card.noteJa,
        part_of_speech: card.partOfSpeech,
        passage: card.passage,
        sentence: card.sentence === null
          ? null
          : { highlight_end: card.sentence.highlightEnd, highlight_start: card.sentence.highlightStart, text: card.sentence.text },
        stage: card.stage,
        surface: card.surface,
      })),
      today: result.value.today,
    })
    return res.status(200).json(response)
  }
}
