import { Request, Response } from "express"

import { getAdminUserPathParamSchema, getAdminUserResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import {
  AuthAccountRepository,
  LearningRecordRepository,
  UserGoalRepository,
  UserRepository,
  VocabularyRepository,
} from "../../../repository"
import * as service from "../../../service"
import { convertUserStatsToResponse } from "../../user/learning-record-mapper"
import { convertVocabularySummaryToResponse } from "../../vocabulary/vocabulary-mapper"

/**
 * admin のユーザーの詳細API（基本の情報・ログイン方法・最後に学習した日と、マイページと同じ学習のまとめ・単語帳の数）。ユーザーが居なければ 404
 */
export class AdminUserDetailController {
  constructor(
    private _authAccountRepository: AuthAccountRepository,
    private _learningRecordRepository: LearningRecordRepository,
    private _userGoalRepository: UserGoalRepository,
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(getAdminUserPathParamSchema, req.params)

    const result = await service.adminUser.getAdminUser(
      id,
      {
        authAccountRepository: this._authAccountRepository,
        learningRecordRepository: this._learningRecordRepository,
        userGoalRepository: this._userGoalRepository,
        userRepository: this._userRepository,
        vocabularyRepository: this._vocabularyRepository,
      },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const { stats, user, vocabulary } = result.value
    const response = parseResponse(getAdminUserResponseSchema, {
      stats: convertUserStatsToResponse(stats),
      user: {
        id: user.id,
        avatar_url: user.avatarUrl,
        email: user.email,
        last_studied_date: user.lastStudiedDate,
        name: user.name,
        providers: user.providers,
        timezone: user.timezone,
        created_at: user.createdAt.toISOString(),
      },
      vocabulary: convertVocabularySummaryToResponse(vocabulary),
    })
    return res.status(200).json(response)
  }
}
