import { Request, Response } from "express"

import { deleteTagPathParamSchema } from "@repo/api-schema"

import { parseRequest } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { TagRepository } from "../../../repository"
import * as service from "../../../service"

/**
 * admin のタグの削除API。付けていたソースからも外れる。成功は 204（ボディなし）
 */
export class AdminTagDeleteController {
  constructor(private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const { id } = parseRequest(deleteTagPathParamSchema, req.params)

    const result = await service.tag.deleteTag(id, { tagRepository: this._tagRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    return res.status(204).end()
  }
}
