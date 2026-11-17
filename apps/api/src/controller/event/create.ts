import { Request, Response } from "express"

import { createEventRequestSchema, createEventResponseSchema } from "@repo/api-schema"
import type { EventTracker } from "@repo/events"

import { findUserId } from "../../lib/find-user-id"
import { parseRequest, parseResponse } from "../../lib/parse-schema"

export class EventCreateController {
  constructor(private _eventTracker: EventTracker) {}

  public async execute(req: Request, res: Response) {
    /**
     * このエンドポイントは PUBLIC_PATHS に含めていないため、auth middleware を
     * 通った時点で userId は必ず存在する。無い場合は middleware の設定ミスなので
     * throw して想定外例外ハンドラに 500 を返させる（黙って捨てない）。
     */
    const userId = findUserId(req)
    if (userId === undefined) {
      throw new Error("userId is missing. POST /api/events must be behind the auth middleware.")
    }

    const { events } = parseRequest(createEventRequestSchema, req.body)

    this._eventTracker.trackAll(
      events.map((event) => ({
        name: event.name,
        properties: event.properties,
        /**
         * `source` は server 側で決める（クライアントの自己申告を信用しない）
         */
        source: "web" as const,
        userId,
      })),
    )

    const response = parseResponse(createEventResponseSchema, { accepted: events.length })
    return res.status(200).json(response)
  }
}
