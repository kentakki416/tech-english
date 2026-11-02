import { Request, Response } from "express"

import { deleteSourcePathParamSchema } from "@repo/api-schema"

import { parseRequest } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceCollectionRunRepository, SourceRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin のソースの削除API。公開中の問題・解答の記録も一緒に消える。成功は 204（ボディなし）
 */
export class AdminSourceDeleteController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(deleteSourcePathParamSchema, req.params)

    const result = await service.source.deleteSource(
      id,
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    return res.status(204).end()
  }
}
