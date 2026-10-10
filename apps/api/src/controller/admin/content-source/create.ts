import { Request, Response } from "express"

import { createContentSourceRequestSchema, createContentSourceResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { ContentSourceRepository } from "../../../repository"
import * as service from "../../../service"

import { convertContentSourceRequestToInput, convertContentSourceToResponse } from "./content-source-mapper"

/**
 * admin のソース登録API。website は無効の状態で作る
 */
export class AdminContentSourceCreateController {
  constructor(private _contentSourceRepository: ContentSourceRepository) {}

  public async execute(req: Request, res: Response) {
    const data = parseRequest(createContentSourceRequestSchema, req.body)

    const result = await service.contentSource.createContentSource(convertContentSourceRequestToInput(data), {
      contentSourceRepository: this._contentSourceRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createContentSourceResponseSchema, convertContentSourceToResponse(result.value))
    return res.status(201).json(response)
  }
}
