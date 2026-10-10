import { type GetUserResponse, getUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const userApi = {
  /**
   * GET /api/user。ログイン中のユーザー
   */
  get: async (): Promise<GetUserResponse> => {
    const result = await apiClient.get("/api/user")
    return getUserResponseSchema.parse(result.data)
  },
}
