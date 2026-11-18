import { Response } from "express"

import { getRandomPassageQueryStringSchema, getRandomPassageResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { PassageRepository, ReadingAttemptRepository } from "../../repository"
import * as service from "../../service"

export class PassageRandomController {
  constructor(
    private _passageRepository: PassageRepository,
    private _readingAttemptRepository: ReadingAttemptRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const query = parseRequest(getRandomPassageQueryStringSchema, req.query)

    const result = await service.passage.getRandomPassageId(
      {
        filter: { difficulties: query.difficulty, tags: query.tag },
        userId: req.userId!,
      },
      { passageRepository: this._passageRepository, readingAttemptRepository: this._readingAttemptRepository },
    )

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getRandomPassageResponseSchema, { id: result.value.id })
    return res.status(200).json(response)
  }
}
