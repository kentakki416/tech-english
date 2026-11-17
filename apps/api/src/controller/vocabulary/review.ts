import { Response } from "express"

import { reviewVocabularyCardRequestSchema, reviewVocabularyCardResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { TransactionRunner, UserRepository, VocabularyRepository } from "../../repository"
import * as service from "../../service"

export class VocabularyReviewController {
  constructor(
    private _transactionRunner: TransactionRunner,
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const data = parseRequest(reviewVocabularyCardRequestSchema, req.body)

    const result = await service.vocabulary.reviewVocabularyCard(
      req.userId!,
      { activeSeconds: data.active_seconds, clientReviewId: data.client_review_id, grade: data.grade, lemma: data.lemma },
      {
        transactionRunner: this._transactionRunner,
        userRepository: this._userRepository,
        vocabularyRepository: this._vocabularyRepository,
      },
      { now: new Date() },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(reviewVocabularyCardResponseSchema, {
      due_date: result.value.dueDate,
      lemma: result.value.lemma,
      stage: result.value.stage,
    })
    return res.status(200).json(response)
  }
}
