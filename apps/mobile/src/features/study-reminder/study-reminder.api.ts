import {
  type GetUserReminderResponse,
  getUserReminderResponseSchema,
  type UpdateUserReminderRequest,
  type UpdateUserReminderResponse,
  updateUserReminderResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * リマインダーの設定の API 通信層
 */
export const studyReminderApi = {
  /**
   * GET /api/user/reminder。未保存なら既定値（オフ・毎日・21:00）
   */
  get: async (): Promise<GetUserReminderResponse> => {
    const result = await apiClient.get("/api/user/reminder")
    return getUserReminderResponseSchema.parse(result.data)
  },

  /**
   * PUT /api/user/reminder。3 項目とも送る（オフにするときも曜日と時刻を保持する）
   */
  put: async (body: UpdateUserReminderRequest): Promise<UpdateUserReminderResponse> => {
    const result = await apiClient.put("/api/user/reminder", body)
    return updateUserReminderResponseSchema.parse(result.data)
  },
}
