import { NextRequest, NextResponse } from "next/server"

import { adminAuthRefreshResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_OPTIONS,
  isAccessTokenExpiringSoon,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_OPTIONS,
} from "@/libs/auth-cookies"
import { resolveSafeRedirectPath } from "@/libs/safe-redirect"

/**
 * production 以外でのみ公開する dev 専用パス
 */
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/api/dev/login"]
  : []

const SIGN_IN_PATH = "/signin"

const API_PATH_PREFIX = "/api/"

/**
 * サインインせずに開けるパス。サインイン画面（SIGN_IN_PATH）以外は token の更新もしない
 * （callback・signout・dev login は自分で cookie を書き換えるので、先に更新すると書き換える前の refresh token を無効にする）
 */
const PUBLIC_PATHS = [
  SIGN_IN_PATH,
  "/api/auth/callback/google",
  "/api/auth/signout",
  /**
   * サインイン・サインアップのフォームの見本（デモ）。サインインしなくても見られる
   */
  "/demo/signin",
  "/demo/signup",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * 完全一致か、`/` 区切り（path segment 境界）の下にあるか。
 * `pathname.startsWith(p)` だと `/signin` が `/signin-foo` も通してしまう
 */
const isPathUnderPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

/**
 * refresh の api を待つ上限。api が応答しないときに、画面の描画を長く止めない
 * （打ち切ったら failed として扱い、cookie を残したままサインイン画面に送るか、そのまま通す）
 */
const REFRESH_TIMEOUT_MS = 5_000

type RefreshResult =
  | { accessToken: string; refreshToken: string; status: "refreshed" }
  | { status: "unauthorized" }
  | { status: "failed" }

/**
 * api に refresh token を渡して、新しい access / refresh token を受け取る。
 * 401（refresh token が無効・使用済み、admin が消された）と、それ以外の失敗（api の障害など）を分けて返す
 */
const requestTokenRefresh = async (refreshToken: string): Promise<RefreshResult> => {
  try {
    const res = await fetch(`${env.API_URL}/api/admin/auth/refresh`, {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    if (res.status === 401) return { status: "unauthorized" }
    if (!res.ok) return { status: "failed" }
    const json = adminAuthRefreshResponseSchema.parse(await res.json())
    return { accessToken: json.access_token, refreshToken: json.refresh_token, status: "refreshed" }
  } catch {
    return { status: "failed" }
  }
}

/**
 * /api/ の下（Route Handler）は、サインイン画面に redirect せず 401 の JSON を返す。
 * ブラウザの fetch から呼ばれるので、redirect にすると fetch がそれを辿り、サインイン画面の HTML を受け取ってしまう
 */
const rejectUnauthenticated = (req: NextRequest): NextResponse => {
  if (req.nextUrl.pathname.startsWith(API_PATH_PREFIX)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(SIGN_IN_PATH, req.url)
  url.searchParams.set("redirect", resolveSafeRedirectPath(`${req.nextUrl.pathname}${req.nextUrl.search}`))
  return NextResponse.redirect(url)
}

/**
 * 認証ガードと access token の更新を行う。
 *
 * **更新（refresh）はここでだけ行う。** Server Component の中では cookie を書けないため、
 * api-client で refresh すると api 側だけ refresh token が作り直され、cookie は古いままになる。
 * ここなら、レスポンスに新しい cookie を付けると同時に、同じリクエストの Cookie ヘッダーも
 * 書き換えて先に渡せるので、その画面の Server Component が新しい access token で api を呼べる。
 */
export const proxy = async (req: NextRequest) => {
  const { pathname } = req.nextUrl
  const isPublicPath = PUBLIC_PATHS.some(p => isPathUnderPrefix(pathname, p))
  /**
   * サインイン画面でも更新する。api の一時的な障害でサインイン画面に送られた後、開き直せば元の画面に戻れるように
   */
  if (isPublicPath && pathname !== SIGN_IN_PATH) {
    return NextResponse.next()
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  if (accessToken !== undefined && !isAccessTokenExpiringSoon(accessToken)) {
    return NextResponse.next()
  }

  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (refreshToken === undefined) {
    return isPublicPath ? NextResponse.next() : rejectUnauthenticated(req)
  }

  const result = await requestTokenRefresh(refreshToken)

  if (result.status === "refreshed") {
    req.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken)
    req.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken)
    const res = NextResponse.next({ request: { headers: req.headers } })
    res.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS)
    res.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS)
    return res
  }

  if (isPublicPath) {
    return NextResponse.next()
  }

  /**
   * 401 でも cookie は消さない。同時に来た別のリクエスト（画面の先読みなど）が先に更新に
   * 成功していると、この refresh token はもう使用済みになっている。ここで消すと、
   * 成功した側が付けた新しい cookie まで消える。サインイン画面は有効な access の cookie が
   * あれば redirect に戻す。
   *
   * api の障害など（failed）で access token も無いときも、cookie を消さずにサインイン画面に送る。
   * そのまま通すと画面の api 呼び出しが 401 になり、api-client が cookie を消してしまう
   * （一時的な障害でログアウトされる）。サインイン画面を開き直せば、そこでもう一度更新を試みる。
   */
  if (result.status === "unauthorized" || accessToken === undefined) {
    return rejectUnauthenticated(req)
  }

  /**
   * failed で access token はまだ残っている（期限まで 30 秒を切っただけ）ときは、そのまま通す
   */
  return NextResponse.next()
}

export const config = {
  /**
   * _next/static・_next/image・favicon.svg・public の images 以外のすべて。
   * images はテンプレートの静的画像で秘密を含まず、next/image の最適化がサーバー内部で
   * 認証なしに取得するため除外する
   */
  matcher: ["/((?!_next/static|_next/image|favicon.svg|images/).*)"],
}
