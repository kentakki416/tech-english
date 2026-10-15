import { Request, Response } from "express"

import { createTagRequestSchema, createTagResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../../lib/parse-schema"
import { sendError } from "../../../lib/send-error"
import { TagRepository } from "../../../repository"
import * as service from "../../../service"

import { convertTagToResponse } from "./tag-mapper"

/**
 * admin のタグの作成API。color を省くと自動で割り当てる
 */
export class AdminTagCreateController {
  constructor(private _tagRepository: TagRepository) {}

  public async execute(req: Request, res: Response) {
    const data = parseRequest(createTagRequestSchema, req.body)

    const result = await service.tag.createTag(
      { color: data.color ?? null, name: data.name },
      { tagRepository: this._tagRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(createTagResponseSchema, convertTagToResponse(result.value))
    return res.status(201).json(response)
  }
}
