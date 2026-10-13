import { Response } from "express"

import { lookupDictionaryQueryStringSchema, lookupDictionaryResponseSchema } from "@repo/api-schema"

import { parseRequest, parseResponse } from "../../lib/parse-schema"
import { sendError } from "../../lib/send-error"
import { AuthRequest } from "../../middleware/auth"
import { DictionaryRepository } from "../../repository"
import * as service from "../../service"

/**
 * 英和辞書の検索API（GET /api/dictionary?word=）。見つかった見出し語と意味を返し、見つからなければ 404
 */
export class DictionaryLookupController {
  constructor(private _dictionaryRepository: DictionaryRepository) {}

  public async execute(req: AuthRequest, res: Response) {
    const { word } = parseRequest(lookupDictionaryQueryStringSchema, req.query)

    const result = await service.dictionary.lookupWord({ word }, { dictionaryRepository: this._dictionaryRepository })

    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(lookupDictionaryResponseSchema, {
      headword: result.value.headword,
      meaning_ja: result.value.meaningJa,
    })
    return res.status(200).json(response)
  }
}
