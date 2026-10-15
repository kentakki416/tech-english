import axios, { create as createAxiosInstance, type InternalAxiosRequestConfig, isAxiosError } from "axios"

import { type AuthRefreshRequest, authRefreshResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { useAttemptStore } from "@/features/attempt/attempt.store"
import { clearStoredTokens, getStoredTokens, saveTokens } from "@/features/auth/auth.storage"
import { useAuthStore } from "@/features/auth/auth.store"

/**
 * refresh の応答を待つ上限。応答の無い通信があると refreshPromise が決着せず、それ以降に 401 になったリクエストが
 * すべて待ち続けるため。モバイルの回線は遅いことがあるので、web（server 間の通信で 5 秒）より長くし、ほかの API と
 * 同じ 15 秒にする（打ち切った後に api が更新を終えていても、api は旧 refresh token を短い猶予の間だけ受け付けるので、
 * 次の refresh で同じ新しい token を受け取れる）
 */
const REFRESH_TIMEOUT_MS = 15_000

/**
 * API の呼び出しの既定の打ち切り。axios の既定（0）は無制限で、api が応答しないと画面が読み込み中・提出中のまま止まるため。
 * 提出は冪等なので、打ち切った後に api が処理を終えていても、もう一度送れば同じ結果が返る
 */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * 401 で refresh したあと 1 回だけ再送したかの印
 */
type RetryableRequestConfig = InternalAxiosRequestConfig & { isRetry?: boolean }

export const apiClient = createAxiosInstance({ baseURL: env.EXPO_PUBLIC_API_URL, timeout: REQUEST_TIMEOUT_MS })

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
    const res = await axios.post(`${env.EXPO_PUBLIC_API_URL}/api/auth/refresh`, body, { timeout: REFRESH_TIMEOUT_MS })
    const data = authRefreshResponseSchema.parse(res.data)
    await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
    return true
  } catch (error) {
    /** 401 のときだけログアウトする（通信エラー・timeout ではログイン状態を消さない） */
    if (isAxiosError(error) && error.response?.status === 401) {
      await expireSession()
    }
    return false
  }
}

/**
 * refresh token が失効したときの強制ログアウト。トークンとメモリに持つ挑戦（attempt.store）を消してログイン画面に戻す
 *
 * ユーザーが押すログアウト（`src/features/auth/auth.session.ts` の `signOut`）とは別の経路にしている。
 * 強制ログアウトでは通知の予約を取り消さない（ログインが切れても通知は届き、タップでログイン画面に進む仕様。study-reminder）。
 * リマインダーの設定の store は、ログイン状態の変化を見て useStudyReminderSync が空にする
 */
const expireSession = async (): Promise<void> => {
  await clearStoredTokens()
  useAttemptStore.getState().clearStoreAttempts()
  useAuthStore.getState().setStatus("signedOut")
}
