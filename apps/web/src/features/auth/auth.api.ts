import "server-only"

import type { AuthLogoutRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const authApi = {
  logout: async (refreshToken: string): Promise<void> => {
    const body: AuthLogoutRequest = { refresh_token: refreshToken }
    await apiClient.post("/api/auth/logout", body)
  },
}
