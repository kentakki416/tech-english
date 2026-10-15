import { Request, Response } from "express"

import { updateTagPathParamSchema, updateTagRequestSchema, updateTagResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { TagRepository } from "../../../repository"
import * as service from "../../../service"

import { convertTagToResponse } from "./tag-mapper"

/**
 * admin のタグの更新API。名前と色の両方を送る
 */
export class AdminTagUpdateController {
  constructor(private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(updateTagPathParamSchema, req.params)
    const data = parseRequest(updateTagRequestSchema, req.body)

    const result = await service.tag.updateTag(
      id,
      { color: data.color, name: data.name },
      { tagRepository: this._tagRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(updateTagResponseSchema, convertTagToResponse(result.value))
    return res.status(200).json(response)
  }
}
