import "server-only"

import { type DeleteUserRequest, type UpdateUserResponse, updateUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const userApi = {
  /**
   * 成功は 204（ボディなし）。確認の文言が違えば API が 400（ApiClientError）
   */
  delete: async (input: DeleteUserRequest): Promise<void> => {
    await apiClient.delete("/api/user", input)
  },

  /**
   * 記録済みの学習日は動かない（API は users.timezone だけを変える）。不正な名前は API が 400（ApiClientError）
   */
  updateTimezone: async (timezone: string): Promise<UpdateUserResponse> => {
    const raw = await apiClient.patch<unknown>("/api/user", { timezone })
    return updateUserResponseSchema.parse(raw)
  },
}
