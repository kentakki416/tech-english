import {
  type DeleteUserRequest,
  type GetUserResponse,
  getUserResponseSchema,
  type UpdateUserRequest,
  type UpdateUserResponse,
  updateUserResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const userApi = {
  /**
   * DELETE /api/user。アカウントの削除。成功は 204（ボディなし）。確認の文言が違えば API が 400
   */
  delete: async (body: DeleteUserRequest): Promise<void> => {
    await apiClient.delete("/api/user", { data: body })
  },

  /**
   * GET /api/user。ログイン中のユーザー
   */
  get: async (): Promise<GetUserResponse> => {
    const result = await apiClient.get("/api/user")
    return getUserResponseSchema.parse(result.data)
  },

  /**
   * PATCH /api/user。タイムゾーンの変更。記録済みの学習日は動かない（API は users.timezone だけを変える）。
   * 不正な名前は API が 400
   */
  updateTimezone: async (timezone: string): Promise<UpdateUserResponse> => {
    const body: UpdateUserRequest = { timezone }
    const result = await apiClient.patch("/api/user", body)
    return updateUserResponseSchema.parse(result.data)
  },
}
