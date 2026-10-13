import { Response } from "express"

import { submitAttemptPathParamSchema, submitAttemptRequestSchema, submitAttemptResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository, TransactionRunner, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertSubmittedAttemptToResponse } from "./mapper"

/**
 * 提出API（POST /api/attempt/:id/submit）。採点結果（正解・解説・根拠を含む）を 200 で返す。
 * すでに提出済みなら保存済みの結果を同じ 200 で返す（冪等）。期限切れは 409、他人の挑戦・存在しない ID は 404
 */
export class AttemptSubmitController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
    private _transactionRunner: TransactionRunner,
    private _userRepository: UserRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const { id } = parseRequest(submitAttemptPathParamSchema, req.params)
    const body = parseRequest(submitAttemptRequestSchema, req.body)

    const result = await service.attempt.submitAttempt(
      {
        activeSeconds: body.active_seconds,
        answers: body.answers.map((answer) => ({
          questionId: answer.question_id,
          selectedChoiceIndex: answer.selected_choice_index,
        })),
        attemptId: id,
        now: new Date(),
        translatedBlockCount: body.translated_block_count,
        userId: req.userId!,
        wordLookups: body.word_lookups.map((lookup) => ({
          glossaryEntryId: lookup.glossary_entry_id,
          lemma: lookup.lemma,
          source: lookup.source,
          surface: lookup.surface,
        })),
      },
      {
        passageRepository: this._passageRepository,
        readingAttemptRepository: this._readingAttemptRepository,
        transactionRunner: this._transactionRunner,
        userRepository: this._userRepository,
      },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(submitAttemptResponseSchema, convertSubmittedAttemptToResponse(result.value))
    return res.status(200).json(response)
  }
}
