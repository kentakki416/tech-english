import "server-only"

import { type UpdateUserResponse, updateUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * 認証中ユーザー（自分自身）の更新の API 通信層。取得は `get-user.ts`（React の cache で包む）
 */
export const userApi = {
  /**
   * 記録済みの学習日は動かない（API は users.timezone だけを変える）。不正な名前は API が 400（ApiClientError）
   */
  updateTimezone: async (timezone: string): Promise<UpdateUserResponse> => {
    const raw = await apiClient.patch<unknown>("/api/user", { timezone })
    return updateUserResponseSchema.parse(raw)
  },
}
