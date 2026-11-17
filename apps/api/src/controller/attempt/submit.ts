import { Response } from "express"

import { submitAttemptPathParamSchema, submitAttemptRequestSchema, submitAttemptResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository, TransactionRunner, UserRepository } from "../../repository"
import * as service from "../../service"

import { convertSubmittedAttemptToResponse } from "./mapper"

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
        listenedBlockCount: body.listened_block_count,
        now: new Date(),
        translatedBlockCount: body.translated_block_count,
        translatedQuestionCount: body.translated_question_count,
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
