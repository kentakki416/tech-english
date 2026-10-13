import axios, { create as createAxiosInstance, type InternalAxiosRequestConfig, isAxiosError } from "axios"

import { type AuthRefreshRequest, authRefreshResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { clearStoredTokens, getStoredTokens, saveTokens } from "@/features/auth/auth.storage"
import { useAuthStore } from "@/features/auth/auth.store"

/**
 * 401 で refresh したあと 1 回だけ再送したかの印
 */
type RetryableRequestConfig = InternalAxiosRequestConfig & { isRetry?: boolean }

/**
 * api を呼ぶ HTTP クライアント。各機能の `*.api.ts` はこれを使う
 *
 * - 保存済みの access token を Bearer で付ける
 * - 401 なら refresh token でトークンを更新し、同じリクエストを 1 回だけ再送する
 */
export const apiClient = createAxiosInstance({ baseURL: env.EXPO_PUBLIC_API_URL })

apiClient.interceptors.request.use(async (config) => {
  const tokens = await getStoredTokens()
  if (tokens) config.headers.Authorization = `Bearer ${tokens.accessToken}`
  return config
})

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) throw error

  const config: RetryableRequestConfig = error.config
  if (config.isRetry) throw error

  const isRefreshed = await refreshOnce()
  if (!isRefreshed) throw error

  config.isRetry = true
  return apiClient(config)
})

let refreshPromise: Promise<boolean> | null = null

/**
 * 同時に複数の 401 が来ても refresh は 1 回だけ（refresh token はローテーションで 1 回しか使えない）
 */
const refreshOnce = async (): Promise<boolean> => {
  refreshPromise ??= tryRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

/**
 * refresh token でトークンを更新して保存する。更新できたら true
 */
const tryRefresh = async (): Promise<boolean> => {
  const tokens = await getStoredTokens()
  if (!tokens) return false
  try {
    /** interceptor を通さないよう素の axios で呼ぶ */
    const body: AuthRefreshRequest = { refresh_token: tokens.refreshToken }
    const res = await axios.post(`${env.EXPO_PUBLIC_API_URL}/api/auth/refresh`, body)
    const data = authRefreshResponseSchema.parse(res.data)
    await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
    return true
  } catch (error) {
    /** 401 のときだけログアウトする（通信エラーではログイン状態を消さない） */
    if (isAxiosError(error) && error.response?.status === 401) {
      await expireSession()
    }
    return false
  }
}

/**
 * refresh token が失効したときの強制ログアウト。トークンを消してログイン画面に戻す
 *
 * ユーザーが押すログアウト（`src/features/auth/auth.session.ts` の `signOut`）とは別の経路にしている。
 * 強制ログアウトでは通知の予約を取り消さない（ログインが切れても通知は届き、タップでログイン画面に進む仕様。study-reminder）。
 * リマインダーの設定の store は、ログイン状態の変化を見て useStudyReminderSync が空にする
 */
const expireSession = async (): Promise<void> => {
  await clearStoredTokens()
  useAuthStore.getState().setStatus("signedOut")
}
