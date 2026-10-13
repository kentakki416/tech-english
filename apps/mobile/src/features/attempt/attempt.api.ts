import { type StartAttemptResponse, startAttemptResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 挑戦の API 通信層（step9 で getDetail / submit を足す）
 */
export const attemptApi = {
  /**
   * POST /api/passage/:id/attempt。期限内の挑戦中があれば API は新しく作らずにそれを返す
   */
  start: async (passageId: number): Promise<StartAttemptResponse> => {
    const result = await apiClient.post(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(result.data)
  },
}
