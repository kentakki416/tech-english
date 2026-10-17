import "server-only"

import { type GetAdminMeResponse, getAdminMeResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * admin の API 通信層
 */
export const adminApi = {
  /**
   * サインイン中の admin
   */
  getMe: async (): Promise<GetAdminMeResponse> => {
    const raw = await apiClient.get<unknown>("/api/admin/me")
    return getAdminMeResponseSchema.parse(raw)
  },
}
