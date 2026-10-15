import { Request, Response } from "express"

import { getAdminUserListQueryStringSchema, getAdminUserListResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { UserRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin のユーザー一覧API（名前・メールアドレスの絞り込み、並べ替え、offset のページ分け）
 */
export class AdminUserListController {
  constructor(private _userRepository: UserRepository) {}

  public async execute(req: Request, res: Response) {
    const query = parseRequest(getAdminUserListQueryStringSchema, req.query)

    const result = await service.adminUser.getAdminUserList(query, { userRepository: this._userRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getAdminUserListResponseSchema, {
      limit: result.value.limit,
      page: result.value.page,
      total: result.value.total,
      users: result.value.items.map((user) => ({
        id: user.id,
        avatar_url: user.avatarUrl,
        email: user.email,
        last_studied_date: user.lastStudiedDate,
        name: user.name,
        providers: user.providers,
        solved_attempts: user.solvedAttempts,
        created_at: user.createdAt.toISOString(),
      })),
    })
    return res.status(200).json(response)
  }
}
