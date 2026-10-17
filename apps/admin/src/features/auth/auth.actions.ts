"use server"

import "server-only"

import { redirect } from "next/navigation"

import { apiClient } from "@/libs/api-client"
import { clearAuthCookies, getRefreshToken } from "@/libs/auth"

/**
 * ログアウト。api の refresh token を無効にしてから cookie を消し、サインイン画面に送る
 */
export const logoutAction = async () => {
  const refreshToken = await getRefreshToken()
  if (refreshToken) {
    try {
      await apiClient.post("/api/admin/auth/logout", { refresh_token: refreshToken })
    } catch {
      /**
       * api が失敗しても（api-client の 401 の redirect も）握りつぶして cookie を消す（手元のセッションは必ず終える）。
       * そのため、ここでは unstable_rethrow しない
       */
    }
  }
  await clearAuthCookies()
  redirect("/signin")
}
