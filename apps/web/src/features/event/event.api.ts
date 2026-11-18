import "server-only"

import type { CreateEventRequest, CreateEventResponse } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const eventApi = {
  create: async (body: CreateEventRequest): Promise<CreateEventResponse> =>
    apiClient.post<CreateEventResponse>("/api/events", body),
}
