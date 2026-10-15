import { Request, Response } from "express"

import { getTagListResponseSchema } from "@repo/api-schema"

import { parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { TagRepository } from "../../../repository"
import * as service from "../../../service"

import { convertTagWithSourceCountToResponse } from "./tag-mapper"

/**
 * admin のタグの一覧API。使っているソースの数つき
 */
export class AdminTagListController {
  constructor(private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const result = await service.tag.getTags({ tagRepository: this._tagRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getTagListResponseSchema, {
      tags: result.value.map(convertTagWithSourceCountToResponse),
    })
    return res.status(200).json(response)
  }
}
