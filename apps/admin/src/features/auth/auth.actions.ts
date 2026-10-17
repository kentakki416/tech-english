"use server"

import "server-only"

import { redirect } from "next/navigation"

import { ApiClientError, apiClient } from "@/libs/api-client"
import { clearAuthCookies, getRefreshToken } from "@/libs/auth"
import { getErrorName } from "@/libs/error-name"

/**
 * ログアウト。api の refresh token を無効にしてから cookie を消し、サインイン画面に送る
 */
export const logoutAction = async () => {
  const refreshToken = await getRefreshToken()
  if (refreshToken) {
    try {
      await apiClient.post("/api/admin/auth/logout", { refresh_token: refreshToken })
    } catch (error) {
      /**
       * api が失敗しても（api-client の 401 の redirect も）握りつぶして cookie を消す（手元のセッションは必ず終える）。
       * そのため、ここでは unstable_rethrow しない
       */
      console.error("Admin logout failed", {
        error: getErrorName(error),
        status: error instanceof ApiClientError ? error.status : undefined,
      })
    }
  }
  await clearAuthCookies()
  redirect("/signin")
}
