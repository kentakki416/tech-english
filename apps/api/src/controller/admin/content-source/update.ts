import { Request, Response } from "express"

import {
  updateContentSourcePathParamSchema,
  updateContentSourceRequestSchema,
  updateContentSourceResponseSchema,
} from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { ContentSourceRepository, TagRepository } from "../../../repository"
import * as service from "../../../service"

import { convertContentSourceRequestToInput, convertContentSourceToResponse } from "./content-source-mapper"

/**
 * admin のソース更新API（有効 / 無効の切り替えを含む）。取得方法は変えられない
 */
export class AdminContentSourceUpdateController {
  constructor(private _contentSourceRepository: ContentSourceRepository, private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(updateContentSourcePathParamSchema, req.params)
    const data = parseRequest(updateContentSourceRequestSchema, req.body)

    const result = await service.contentSource.updateContentSource(id, convertContentSourceRequestToInput(data), {
      contentSourceRepository: this._contentSourceRepository,
      tagRepository: this._tagRepository,
    })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateContentSourceResponseSchema, convertContentSourceToResponse(result.value))
    return res.status(200).json(response)
  }
}
