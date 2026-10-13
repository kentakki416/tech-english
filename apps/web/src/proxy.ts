import { NextRequest, NextResponse } from "next/server"

import { ACCESS_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS, REFRESH_TOKEN_COOKIE } from "@/libs/auth"
import { isAccessTokenUsable, refreshAuthTokens } from "@/libs/token-refresh"

/**
 * production 以外でのみ公開する dev 専用パス
 * - `/api/dev/login?as=alice` を踏むだけでログイン状態にできる開発支援機能
 * - `/mock` はデザインモック（design-mock skill）。ダミーデータだけで描画し API を呼ばない
 */
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/api/dev/login", "/mock"]
  : []

/** memo はユーザー非依存で、Express 側も `/api/memo` を公開にしている */
const PUBLIC_PATHS = [
  "/memos",
  "/api/memos",
  /** リダイレクトすると sendBeacon がサインインページの HTML を受け取ってしまう */
  "/api/events",
  "/sign-in",
  /** `/api/auth/callback/github/mobile`（mobile のログイン）もセグメント境界の前方一致で含まれる */
  "/api/auth/callback/github",
  "/api/auth/callback/google",
  /**
   * アカウント削除の完了。削除の Server Action が cookie を消してから redirect する
   */
  "/settings/delete-account/done",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * 完全一致 or path セグメント境界での prefix 一致をチェックする。
 *
 * 単純な `pathname.startsWith(p)` は `/sign-in` が `/sign-in-foo` も通してしまうため、
 * 登録されたページと意図しないパスが衝突するリスクがある。`/` 区切り
 * (= path segment 境界) で一致するもののみ通す。
 *
 * 例 (p = "/sign-in"):
 * - "/sign-in"           → true (完全一致)
 * - "/sign-in/google"    → true (segment 境界の prefix)
 * - "/sign-in-foo"       → false (segment 境界ではない)
 */
const matchesPathPrefix = (pathname: string, p: string): boolean =>
  pathname === p || pathname.startsWith(`${p}/`)

const redirectToSignIn = (req: NextRequest): NextResponse => {
  const url = new URL("/sign-in", req.url)
  url.searchParams.set("redirect", req.nextUrl.pathname)
  return NextResponse.redirect(url)
}

/**
 * JWT の署名は検証せず、Cookie の有無と exp だけで判断する（実検証は API 側で行う）
 *
 * access token が無い（ブラウザが期限で消した）か期限が近ければ、ここで refresh する。
 * Server Component は cookie を書き換えられないので、描画より前のここで更新し、
 * 新しい cookie をこのリクエスト（Server Component / Server Action / Route Handler が読む）とブラウザの両方に渡す。
 * - refresh token が使えない（4xx）: cookie を消してログイン画面へ（Route Handler は 401）
 * - api の障害: 更新せずに通す（ログアウトさせず、ページ側のエラー表示に任せる）
 */
export const proxy = async (req: NextRequest) => {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => matchesPathPrefix(pathname, p))) {
    return NextResponse.next()
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  if (!accessToken && !refreshToken) return redirectToSignIn(req)

  const now = Date.now()
  if (!refreshToken || isAccessTokenUsable(accessToken, now)) return NextResponse.next()

  const result = await refreshAuthTokens(refreshToken, now)
  if (result.kind === "unavailable") return NextResponse.next()

  if (result.kind === "rejected") {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : redirectToSignIn(req)
    res.cookies.delete(ACCESS_TOKEN_COOKIE)
    res.cookies.delete(REFRESH_TOKEN_COOKIE)
    return res
  }

  /** req.cookies.set はリクエストの cookie ヘッダーも書き換えるので、それを next に渡す */
  req.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken)
  req.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken)
  const res = NextResponse.next({ request: { headers: req.headers } })
  res.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken, AUTH_COOKIE_OPTIONS.access)
  res.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken, AUTH_COOKIE_OPTIONS.refresh)
  return res
}

export const config = {
  /** _next, _next/static, _next/image, favicon, public 配下を除外 */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
