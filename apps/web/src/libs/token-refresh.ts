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
 * refresh API の応答を待つ上限。api が応答しないときに全リクエストを止めない。
 * 打ち切っても api はローテーションを終えていることがあるが、api はローテーション後 30 秒の間は同じ旧 refresh token に
 * 同じペアを返す（猶予）ので、次のリクエストの再試行で受け取れる
 */
const REFRESH_TIMEOUT_MS = 5_000

/**
 * 同じ refresh token での更新結果を使い回す時間。期限切れの cookie を持つリクエストが同時に来たとき（ページと prefetch など）の
 * 更新を、このプロセスでは 1 回の api 呼び出しにまとめる。
 * 2 回目以降の更新が 401 にならないことは api の猶予（ローテーション後 30 秒は同じペアを返す）が保証するので、
 * これは api の呼び出しを減らすためのもの（プロセス内の Map なので、web を複数台にしたときは台をまたいで共有されない）
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
 * refresh API が token を使えないと返したとき（401: 失効・削除済みユーザー・署名の不一致、400: body が不正）だけ rejected。
 * 429（レート制限）・5xx・timeout・通信の失敗は unavailable（ログアウトさせず、次のリクエストで再試行する）。
 * 429 は一時的なもので token が使えないわけではないため、ログアウトさせない（api は body の refresh token が検証できればそのユーザー単位、できなければ IP 単位で数える）
 */
const requestRefresh = async (refreshToken: string): Promise<RefreshResult> => {
  try {
    const res = await fetch(`${env.API_URL}/api/auth/refresh`, {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 400) return { kind: "rejected" }
    if (!res.ok) return { kind: "unavailable" }
    const tokens = authRefreshResponseSchema.parse(await res.json())
    return { accessToken: tokens.access_token, kind: "refreshed", refreshToken: tokens.refresh_token }
  } catch {
    return { kind: "unavailable" }
  }
}

/**
 * refresh token で access / refresh token を更新する。同じ refresh token の更新は RECENT_REFRESH_TTL_MS の間 1 回にまとめる。
 * unavailable（api の障害・レート制限）は使い回さず、次のリクエストで再試行する（api の猶予の間なら、打ち切った更新と同じペアが返る）
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
