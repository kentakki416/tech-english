import { Request, Response } from "express"

import { createSourceCollectionRunPathParamSchema, createSourceCollectionRunResponseSchema } from "@repo/api-schema"
import type { CollectSourceJobData, JobQueue } from "@repo/queue"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceCollectionRunRepository, SourceRepository } from "../../../repository"
import * as service from "../../../service"

import { convertSourceCollectionRunToResponse } from "./source-mapper"

/**
 * admin の今すぐ収集の依頼API。記録を作って Queue に積み、202 を返す（収集は worker が行う）
 */
export class AdminSourceCollectController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _sourceCollectionRunRepository: SourceCollectionRunRepository,
    private _collectSourceQueue: JobQueue<CollectSourceJobData>,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(createSourceCollectionRunPathParamSchema, req.params)

    const result = await service.source.requestSourceCollection(
      id,
      { sourceCollectionRunRepository: this._sourceCollectionRunRepository, sourceRepository: this._sourceRepository },
      { collectSourceQueue: this._collectSourceQueue, now: new Date() },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createSourceCollectionRunResponseSchema, {
      collection_run: convertSourceCollectionRunToResponse(result.value),
    })
    return res.status(202).json(response)
  }
}
