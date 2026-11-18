import "server-only"

import type { AdminAuthLogoutRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const authApi = {
  logout: async (refreshToken: string): Promise<void> => {
    const body: AdminAuthLogoutRequest = { refresh_token: refreshToken }
    await apiClient.post("/api/admin/auth/logout", body)
  },
}
