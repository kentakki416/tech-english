import "server-only"

import { type StartAttemptResponse, startAttemptResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 挑戦の API 通信層
 */
export const attemptApi = {
  /**
   * 期限内の挑戦中があれば API は新しく作らずにそれを返す
   */
  start: async (passageId: number): Promise<StartAttemptResponse> => {
    const raw = await apiClient.post<unknown>(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(raw)
  },
}
