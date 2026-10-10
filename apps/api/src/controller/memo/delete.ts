import { Request, Response } from "express"

import { deleteMemoPathParamSchema, deleteMemoResponseSchema } from "@repo/api-schema"
import type { EventTracker } from "@repo/events"

import { findUserId } from "../../lib/find-user-id"
import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { MemoRepository } from "../../repository"
import * as service from "../../service"

/**
 * メモ削除API
 */
export class MemoDeleteController {
  constructor(
    private _memoRepository: MemoRepository,
    private _eventTracker: EventTracker,
  ) {}

  public async execute(req: Request, res: Response) {
    const userId = findUserId(req)
    const { id } = parseRequest(deleteMemoPathParamSchema, req.params)

    const result = await service.memo.deleteMemo(
      id, { memoRepository: this._memoRepository },
      { eventTracker: this._eventTracker, userId },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(deleteMemoResponseSchema, { message: "Memo deleted successfully" })
    return res.status(200).json(response)
  }
}
