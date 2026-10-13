import * as Localization from "expo-localization"

import { authApi } from "./auth.api"
import { clearStoredTokens, getStoredTokens, saveTokens } from "./auth.storage"
import { useAuthStore } from "./auth.store"
import { GITHUB_MOBILE_REDIRECT_URI, openGitHubAuthSession } from "./github-oauth"

export type SignInResult = "cancelled" | "failed" | "signedIn"

/**
 * 起動時にログイン状態を決める。トークンがあればログイン中とし、access token の期限切れは api client の refresh に任せる
 */
export const restoreSession = async (): Promise<void> => {
  try {
    const tokens = await getStoredTokens()
    useAuthStore.getState().setStatus(tokens ? "signedIn" : "signedOut")
  } catch (error) {
    /** secure-store を読めない（端末の Keystore の不具合など）ときはログインし直してもらう */
    console.warn("Failed to restore session:", error)
    useAuthStore.getState().setStatus("signedOut")
  }
}

/**
 * GitHub でログインする。成功するとトークンを保存してログイン中にする（Stack.Protected がタブへ移す）
 */
export const signInWithGitHub = async (): Promise<SignInResult> => {
  try {
    const session = await openGitHubAuthSession()
    if (session.kind !== "success") return session.kind

    const response = await authApi.signInWithGitHub({
      code: session.code,
      code_verifier: session.codeVerifier,
      redirect_uri: GITHUB_MOBILE_REDIRECT_URI,
      timezone: Localization.getCalendars()[0]?.timeZone ?? undefined,
    })
    await saveTokens({ accessToken: response.access_token, refreshToken: response.refresh_token })
  } catch (error) {
    console.warn("Failed to sign in with GitHub:", error)
    return "failed"
  }

  useAuthStore.getState().setStatus("signedIn")
  return "signedIn"
}

/**
 * 開発用のログイン（ログイン画面の「Dev Login」）。api の dev-login で seed 済みの dev ユーザーのトークンを受け取り、
 * GitHub でログインしたときと同じく保存してログイン中にする。`__DEV__` でなければ何もしない
 */
export const signInAsDevUser = async (email: string): Promise<SignInResult> => {
  if (!__DEV__) return "failed"
  try {
    const response = await authApi.devLogin({ email })
    await saveTokens({ accessToken: response.access_token, refreshToken: response.refresh_token })
  } catch (error) {
    console.warn("Failed to sign in as dev user:", error)
    return "failed"
  }

  useAuthStore.getState().setStatus("signedIn")
  return "signedIn"
}

/**
 * ユーザーが押したログアウト。この端末のログイン状態だけを消す（他の端末はログインしたまま）
 *
 * refresh の失敗による強制ログアウト（`src/libs/api-client.ts` の `expireSession`）はここを通らない。
 * 通知の予約の取り消しは study-reminder step3 がここに足す（強制ログアウトでは取り消さない）
 */
export const signOut = async (): Promise<void> => {
  await revokeRefreshToken()
  await clearStoredTokens()
  useAuthStore.getState().setStatus("signedOut")
}

/**
 * この端末の refresh token を api 側で失効させる。失敗してもログアウトは続ける（web の logoutAction と同じ）
 */
const revokeRefreshToken = async (): Promise<void> => {
  const tokens = await getStoredTokens()
  if (!tokens) return
  try {
    await authApi.logout(tokens.refreshToken)
    /**
     * access token の期限切れで途中に refresh が挟まると、送った refresh token はローテーションで失効済みになり、
     * 新しい refresh token が api 側に残る。その場合は新しい方も失効させる
     */
    const latest = await getStoredTokens()
    if (latest && latest.refreshToken !== tokens.refreshToken) await authApi.logout(latest.refreshToken)
  } catch (error) {
    console.warn("Failed to revoke refresh token:", error)
  }
}
