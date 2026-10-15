import {
  type DeleteUserRequest,
  type GetUserResponse,
  getUserResponseSchema,
  type UpdateUserRequest,
  type UpdateUserResponse,
  updateUserResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * アカウント削除の打ち切り（study-reminder の取得・保存と同じ 15 秒）。axios の既定（0）と Android の通信の既定は無制限で、
 * 応答が無いと削除中の表示のまま終わらないため（timeout は通信エラーと同じく、何も消さずに再試行できる状態に戻る）
 */
const DELETE_TIMEOUT_MS = 15_000

export const userApi = {
  /**
   * 成功は 204（ボディなし）。確認の文言が違えば API が 400
   */
  delete: async (body: DeleteUserRequest): Promise<void> => {
    await apiClient.delete("/api/user", { data: body, timeout: DELETE_TIMEOUT_MS })
  },

  get: async (): Promise<GetUserResponse> => {
    const result = await apiClient.get("/api/user")
    return getUserResponseSchema.parse(result.data)
  },

  /**
   * 記録済みの学習日は動かない（API は users.timezone だけを変える）。
   * 不正な名前は API が 400
   */
  updateTimezone: async (timezone: string): Promise<UpdateUserResponse> => {
    const body: UpdateUserRequest = { timezone }
    const result = await apiClient.patch("/api/user", body)
    return updateUserResponseSchema.parse(result.data)
  },
}
