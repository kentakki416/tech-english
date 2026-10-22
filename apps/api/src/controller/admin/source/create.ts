import { Request, Response } from "express"

import { createSourceRequestSchema, createSourceResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { SourceRepository, TagRepository } from "../../../repository"
import * as service from "../../../service"

import { convertSourceRequestToInput, convertSourceToResponse } from "./source-mapper"

/**
 * admin のソース登録API。website は無効の状態で作る
 */
export class AdminSourceCreateController {
  constructor(private _sourceRepository: SourceRepository, private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const data = parseRequest(createSourceRequestSchema, req.body)

    const result = await service.source.createSource(convertSourceRequestToInput(data), {
      sourceRepository: this._sourceRepository,
      tagRepository: this._tagRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createSourceResponseSchema, convertSourceToResponse(result.value))
    return res.status(201).json(response)
  }
}
