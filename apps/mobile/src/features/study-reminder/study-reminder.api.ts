import {
  type GetUserReminderResponse,
  getUserReminderResponseSchema,
  type UpdateUserReminderRequest,
  type UpdateUserReminderResponse,
  updateUserReminderResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 取得・保存の打ち切り。axios の既定（0）と Android の通信の既定は無制限で、応答の無い通信があると
 * 直列キュー（study-reminder.sync.ts）の後ろの処理がいつまでも始まらないため
 */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * リマインダーの設定の API 通信層
 */
export const studyReminderApi = {
  /**
   * GET /api/user/reminder。未保存なら既定値（オフ・毎日・21:00）
   */
  get: async (): Promise<GetUserReminderResponse> => {
    const result = await apiClient.get("/api/user/reminder", { timeout: REQUEST_TIMEOUT_MS })
    return getUserReminderResponseSchema.parse(result.data)
  },

  /**
   * PUT /api/user/reminder。3 項目とも送る（オフにするときも曜日と時刻を保持する）
   */
  put: async (body: UpdateUserReminderRequest): Promise<UpdateUserReminderResponse> => {
    const result = await apiClient.put("/api/user/reminder", body, { timeout: REQUEST_TIMEOUT_MS })
    return updateUserReminderResponseSchema.parse(result.data)
  },
}
