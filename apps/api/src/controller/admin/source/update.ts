import { Request, Response } from "express"

import {
  updateSourcePathParamSchema,
  updateSourceRequestSchema,
  updateSourceResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceRepository, TagRepository } from "../../../repository"
import * as service from "../../../service"
import type { SourceWritePolicy } from "../../../service/source-service"

import { convertSourceToResponse, convertUpdateSourceRequestToInput } from "./source-mapper"

export class AdminSourceUpdateController {
  constructor(
    private _sourceRepository: SourceRepository,
    private _tagRepository: TagRepository,
    private _policy: SourceWritePolicy,
  ) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(updateSourcePathParamSchema, req.params)
    const data = parseRequest(updateSourceRequestSchema, req.body)

    const result = await service.source.updateSource(
      id,
      convertUpdateSourceRequestToInput(data),
      { sourceRepository: this._sourceRepository, tagRepository: this._tagRepository },
      this._policy,
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateSourceResponseSchema, convertSourceToResponse(result.value))
    return res.status(200).json(response)
  }
}
