/**
 * 認証の cookie の名前と属性。proxy からも import するので、next/headers を import しない
 * （cookie を読み書きする関数は libs/auth.ts）
 *
 * web（app_*）と同じホストで動くと、ポートが違っても cookie を共有するため名前を分ける
 */
export const ACCESS_TOKEN_COOKIE = "admin_access_token"
export const OAUTH_REDIRECT_COOKIE = "admin_oauth_redirect"
export const OAUTH_STATE_COOKIE = "admin_oauth_state"
export const REFRESH_TOKEN_COOKIE = "admin_refresh_token"

const isProduction = process.env.NODE_ENV === "production"

const ACCESS_TOKEN_MAX_AGE = 60 * 15
const OAUTH_COOKIE_MAX_AGE = 60 * 5
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7

/**
 * access / refresh の cookie の属性。cookies()（Server Action / Route Handler）と
 * proxy の NextResponse の両方から同じ属性で書く。
 *
 * sameSite を lax にするのは、Google からの callback（google.com → /api/auth/callback/google → 画面）が
 * cross-site 起点の連鎖になり、strict だと最後の画面で cookie が送られないため。CSRF は state で防ぐ
 */
export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: ACCESS_TOKEN_MAX_AGE,
  path: "/",
  sameSite: "lax",
  secure: isProduction,
} as const

export const REFRESH_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: REFRESH_TOKEN_MAX_AGE,
  path: "/",
  sameSite: "lax",
  secure: isProduction,
} as const

/**
 * OAuth の間だけ使う cookie（state とサインイン後の戻り先）の属性
 */
export const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: OAUTH_COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax",
  secure: isProduction,
} as const

/**
 * access token の期限がこの秒数を切っていたら「期限が近い」とみなす。
 * proxy が先に更新しておき、api に届くまでの間に期限が切れて 401 になるのを避けるため
 */
const ACCESS_TOKEN_REFRESH_MARGIN_SECONDS = 30

/**
 * access token の期限が近い（または読めない）か。proxy とサインイン画面が使う。
 * 署名は検証しない（検証は api が行う）。payload の exp を読むだけ
 */
export const isAccessTokenExpiringSoon = (token: string): boolean => {
  try {
    const payload = token.split(".")[1] ?? ""
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const { exp } = JSON.parse(json) as { exp?: unknown }
    if (typeof exp !== "number") return true
    return exp - ACCESS_TOKEN_REFRESH_MARGIN_SECONDS <= Date.now() / 1000
  } catch {
    return true
  }
}
