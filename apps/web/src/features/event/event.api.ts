import "server-only"

import type { CreateEventRequest, CreateEventResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 行動イベントを Express API に送る。
 *
 * `server-only` なのでブラウザからは呼べない。Route Handler 経由で使う
 */
export const eventApi = {
  create: async (body: CreateEventRequest): Promise<CreateEventResponse> =>
    apiClient.post<CreateEventResponse>("/api/events", body),
}
