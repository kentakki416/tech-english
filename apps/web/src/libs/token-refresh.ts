import "server-only"

import { authRefreshResponseSchema } from "@repo/api-schema"

import { env } from "@/env"

/**
 * proxy が行う access token の更新。Server Component は cookie を書き換えられないので、
 * ページの描画より前（proxy）で更新し、新しい cookie をそのリクエストとブラウザの両方に渡す
 */

/**
 * 期限までこれより短い access token は、描画中に切れないよう先に更新する
 */
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000

/**
 * refresh API の応答を待つ上限。api が応答しないときに全リクエストを止めない
 */
const REFRESH_TIMEOUT_MS = 5_000

/**
 * 同じ refresh token での更新結果を使い回す時間。api は refresh token を 1 回で失効させる（ローテーション）ので、
 * 期限切れの cookie を持つリクエストが同時に来たとき（ページと prefetch など）に 2 回目の更新が 401 になってログアウトしないようにする。
 * プロセス内の Map なので、web を複数台にしたときは台をまたいで共有されない
 */
const RECENT_REFRESH_TTL_MS = 30_000

export type RefreshResult =
  | { accessToken: string, kind: "refreshed", refreshToken: string }
  | { kind: "rejected" }
  | { kind: "unavailable" }

const recentRefreshes = new Map<string, { expiresAt: number, promise: Promise<RefreshResult> }>()

/**
 * JWT の payload の exp（秒）。署名は検証しない（検証は api が行う）。読めなければ null
 */
const readTokenExpiry = (token: string): number | null => {
  const payload = token.split(".")[1]
  if (!payload) return null
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return typeof claims === "object" && claims !== null && "exp" in claims && typeof claims.exp === "number"
      ? claims.exp
      : null
  } catch {
    return null
  }
}

/**
 * access token を更新せずにそのまま使えるか。cookie が無い（ブラウザが期限で消した）か、期限が近ければ false。
 * exp が読めないものは api の判断に任せる（毎回の更新でローテーションを繰り返さないため true）
 */
export const isAccessTokenUsable = (accessToken: string | undefined, now: number): boolean => {
  if (!accessToken) return false
  const expiry = readTokenExpiry(accessToken)
  return expiry === null || expiry * 1000 - now > ACCESS_TOKEN_REFRESH_MARGIN_MS
}

/**
 * 4xx は refresh token が使えない（失効・削除済みユーザー）ので rejected、それ以外の失敗は unavailable
 */
const requestRefresh = async (refreshToken: string): Promise<RefreshResult> => {
  try {
    const res = await fetch(`${env.API_URL}/api/auth/refresh`, {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    if (res.status >= 400 && res.status < 500) return { kind: "rejected" }
    if (!res.ok) return { kind: "unavailable" }
    const tokens = authRefreshResponseSchema.parse(await res.json())
    return { accessToken: tokens.access_token, kind: "refreshed", refreshToken: tokens.refresh_token }
  } catch {
    return { kind: "unavailable" }
  }
}

/**
 * refresh token で access / refresh token を更新する。同じ refresh token の更新は RECENT_REFRESH_TTL_MS の間 1 回にまとめる。
 * unavailable（api の障害）は使い回さず、次のリクエストで再試行する
 */
export const refreshAuthTokens = async (refreshToken: string, now: number): Promise<RefreshResult> => {
  for (const [token, entry] of recentRefreshes) {
    if (entry.expiresAt <= now) recentRefreshes.delete(token)
  }

  const recent = recentRefreshes.get(refreshToken)
  if (recent) return recent.promise

  const promise = requestRefresh(refreshToken)
  recentRefreshes.set(refreshToken, { expiresAt: now + RECENT_REFRESH_TTL_MS, promise })
  void promise.then((result) => {
    if (result.kind === "unavailable") recentRefreshes.delete(refreshToken)
  })
  return promise
}
