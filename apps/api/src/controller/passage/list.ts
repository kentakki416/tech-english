import { Response } from "express"

import { getPassageListQueryStringSchema, getPassageListResponseSchema, type PassageListItemResponse } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"
import type { PassageListItem } from "../../service/passage-service"

/**
 * 一覧の 1 件 → レスポンス
 */
const convertPassageListItemToResponse = (item: PassageListItem): PassageListItemResponse => ({
  id: item.passage.id,
  difficulty: item.passage.difficulty,
  my_status: {
    attempt_count: item.myStatus.attemptCount,
    best_correct_count: item.myStatus.bestCorrectCount,
    in_progress_attempt_id: item.myStatus.inProgressAttemptId,
  },
  question_count: item.questionCount,
  source: {
    kind: item.source.kind,
    name: item.source.name,
    tags: item.source.tags,
  },
  time_limit_seconds: item.passage.timeLimitSeconds,
  title: item.passage.title,
  word_count: item.passage.wordCount,
})

/**
 * 問題一覧API（公開中の問題。種別・タグ・難易度・未挑戦の絞り込み、cursor ページング、自分の挑戦状況）
 */
export class PassageListController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getPassageListQueryStringSchema, req.query)

    const result = await service.passage.getPassageList(
      {
        cursor: query.cursor,
        filter: { difficulties: query.difficulty, kind: query.kind ?? null, tags: query.tag },
        limit: query.limit,
        now: new Date(),
        unattemptedOnly: query.unattempted_only,
        userId: req.userId!,
      },
      { passageRepository: this._passageRepository, readingAttemptRepository: this._readingAttemptRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getPassageListResponseSchema, {
      next_cursor: result.value.nextCursor,
      passages: result.value.items.map(convertPassageListItemToResponse),
      tags: result.value.tags,
      total_count: result.value.totalCount,
    })
    return res.status(200).json(response)
  }
}
