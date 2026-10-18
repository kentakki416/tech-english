import "server-only"

import { cache } from "react"

import { type GetAdminMeResponse, getAdminMeResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * admin の API 通信層
 */
export const adminApi = {
  /**
   * サインイン中の admin。1 回のリクエストの中では何度呼んでも、api は 1 回だけ呼ぶ（cache）
   */
  getMe: cache(async (): Promise<GetAdminMeResponse> => {
    const raw = await apiClient.get<unknown>("/api/admin/me")
    return getAdminMeResponseSchema.parse(raw)
  }),
}
