import {
  type AuthDevLoginRequest,
  type AuthDevLoginResponse,
  authDevLoginResponseSchema,
  type AuthGitHubRequest,
  type AuthGitHubResponse,
  authGitHubResponseSchema,
  type AuthLogoutRequest,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export const authApi = {
  /**
   * POST /api/auth/dev-login。seed 済みの dev ユーザー（alice / bob）のトークンを発行する。
   * api が production では無効にしている（docs/spec/dev-login の多重ガード）。呼ぶのは `__DEV__` のときだけ
   */
  devLogin: async (body: AuthDevLoginRequest): Promise<AuthDevLoginResponse> => {
    const result = await apiClient.post("/api/auth/dev-login", body)
    return authDevLoginResponseSchema.parse(result.data)
  },

  /**
   * POST /api/auth/logout。この端末の refresh token を api 側で失効させる（access token が必要）
   */
  logout: async (refreshToken: string): Promise<void> => {
    const body: AuthLogoutRequest = { refresh_token: refreshToken }
    await apiClient.post("/api/auth/logout", body)
  },

  /**
   * POST /api/auth/github。GitHub の code と PKCE の code_verifier を JWT に交換する
   */
  signInWithGitHub: async (body: AuthGitHubRequest): Promise<AuthGitHubResponse> => {
    const result = await apiClient.post("/api/auth/github", body)
    return authGitHubResponseSchema.parse(result.data)
  },
}
