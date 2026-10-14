import "server-only"

import { redirect } from "next/navigation"

import { ApiClientError } from "./api-client"
import { getAccessToken } from "./auth"
import { isAccessTokenUsable } from "./token-refresh"

/**
 * cookie を消してからログイン画面へ移す Route Handler（src/app/api/auth/session-expired/route.ts）
 */
const SESSION_EXPIRED_PATH = "/api/auth/session-expired"

/**
 * api が期限内の access token を 401 で拒んだとき（別の端末でアカウントを削除した・JWT の secret を差し替えた）に、
 * cookie を消す Route Handler を経由してログイン画面へ移す。それ以外のエラーはそのまま投げ直す。
 *
 * - Server Component は cookie を書き換えられず、cookie を残したまま `/sign-in` へ移すと proxy はログイン済みとして扱い、
 *   次のページでも同じ 401 を繰り返す。そのため cookie の削除は Route Handler で行う
 * - access token が無い・期限が近いときの 401 は、proxy の更新が api の障害で失敗した場合なので、ログアウトさせずにページのエラー表示に任せる
 *
 * Server Component から `.catch(redirectIfSessionRejected)` で使う。Route Handler では使わない（呼び出し元に api の status を返すため）
 */
export const redirectIfSessionRejected = async (error: unknown): Promise<never> => {
  if (error instanceof ApiClientError && error.status === 401) {
    const accessToken = await getAccessToken()
    if (isAccessTokenUsable(accessToken ?? undefined, Date.now())) redirect(SESSION_EXPIRED_PATH)
  }
  throw error
}
