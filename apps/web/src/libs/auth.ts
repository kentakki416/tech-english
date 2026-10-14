import { cookies } from "next/headers"

export const ACCESS_TOKEN_COOKIE = "app_access_token"
export const REFRESH_TOKEN_COOKIE = "app_refresh_token"
export const OAUTH_STATE_COOKIE = "app_oauth_state"
export const OAUTH_CODE_VERIFIER_COOKIE = "app_oauth_code_verifier"
export const OAUTH_TIMEZONE_COOKIE = "app_oauth_timezone"

const isProduction = process.env.NODE_ENV === "production"

const ACCESS_TOKEN_MAX_AGE = 60 * 15
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7
const OAUTH_COOKIE_MAX_AGE = 60 * 5

/**
 * OAuth の認可画面へ行く前に保存し、callback で照合・使用する値
 */
export type OAuthSession = {
  codeVerifier: string
  state: string
  timezone: string | null
}

/**
 * sameSite="lax" を使う理由:
 * OAuth コールバック（github.com → /api/auth/callback/github → /）は cross-site 起点の
 * 連鎖ナビゲーションになるため、strict だと最終遷移先で cookie が送信されず
 * proxy が認証無しと判定してしまう。CSRF は state パラメータで対策済み。
 */
export const setAuthCookies = async (accessToken: string, refreshToken: string) => {
  const store = await cookies()
  store.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  })
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  })
}

export const clearAuthCookies = async () => {
  const store = await cookies()
  store.delete(ACCESS_TOKEN_COOKIE)
  store.delete(REFRESH_TOKEN_COOKIE)
}

export const getAccessToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export const getRefreshToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}

/**
 * 認可画面へ行く前に state・code_verifier・タイムゾーンを保存する。
 * GitHub からのトップレベルの戻りで送らせるため sameSite=lax（state 照合と PKCE にだけ使うため攻撃対象は限定的）
 */
export const saveOAuthSession = async (session: OAuthSession) => {
  const store = await cookies()
  const options = {
    httpOnly: true,
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  } as const
  store.set(OAUTH_STATE_COOKIE, session.state, options)
  store.set(OAUTH_CODE_VERIFIER_COOKIE, session.codeVerifier, options)
  if (session.timezone) {
    store.set(OAUTH_TIMEZONE_COOKIE, session.timezone, options)
  } else {
    store.delete(OAUTH_TIMEZONE_COOKIE)
  }
}

/**
 * callback で 1 回だけ読み、その場で 3 つとも消す（使い回させない）。無い cookie は undefined
 */
export const takeOAuthSession = async (): Promise<{ codeVerifier?: string, state?: string, timezone?: string }> => {
  const store = await cookies()
  const session = {
    codeVerifier: store.get(OAUTH_CODE_VERIFIER_COOKIE)?.value,
    state: store.get(OAUTH_STATE_COOKIE)?.value,
    timezone: store.get(OAUTH_TIMEZONE_COOKIE)?.value,
  }
  store.delete(OAUTH_STATE_COOKIE)
  store.delete(OAUTH_CODE_VERIFIER_COOKIE)
  store.delete(OAUTH_TIMEZONE_COOKIE)
  return session
}
