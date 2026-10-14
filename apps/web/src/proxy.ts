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

/**
 * ログインせずに開けるパス。cookie があれば access token の更新だけは行う（PUBLIC_TOKEN_REFRESH_SKIP_PATHS を除く）
 */
const PUBLIC_PATHS = [
  /**
   * memo はユーザー非依存で、Express 側も `/api/memo` を公開にしている
   */
  "/memos",
  "/api/memos",
  /**
   * リダイレクトすると sendBeacon がサインインページの HTML を受け取ってしまう
   */
  "/api/events",
  "/sign-in",
  /**
   * `/api/auth/callback/github/mobile`（mobile のログイン）もセグメント境界の前方一致で含まれる
   */
  "/api/auth/callback/github",
  "/api/auth/callback/google",
  /**
   * api が期限内の access token を拒んだときに、cookie を消してからログイン画面へ移す（src/libs/session.ts）
   */
  "/api/auth/session-expired",
  /**
   * アカウント削除の完了。削除の Server Action が cookie を消してから redirect する
   */
  "/settings/delete-account/done",
  ...DEV_ONLY_PUBLIC_PATHS,
]

/**
 * 認証の cookie を自分で書き換える（ログイン・cookie の削除）public なパス。
 * proxy が更新した cookie と同じレスポンスで食い違わないよう、ここでは access token を更新しない
 */
const PUBLIC_TOKEN_REFRESH_SKIP_PATHS = [
  "/api/auth/callback/github",
  "/api/auth/callback/google",
  "/api/auth/session-expired",
  "/api/dev/login",
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

const deleteAuthCookies = (res: NextResponse): NextResponse => {
  res.cookies.delete(ACCESS_TOKEN_COOKIE)
  res.cookies.delete(REFRESH_TOKEN_COOKIE)
  return res
}

/**
 * 更新した token を、このリクエスト（Server Component / Server Action / Route Handler が読む）とブラウザの両方に渡す
 */
const forwardRefreshedTokens = (req: NextRequest, tokens: { accessToken: string, refreshToken: string }): NextResponse => {
  /**
   * req.cookies.set はリクエストの cookie ヘッダーも書き換えるので、それを next に渡す
   */
  req.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken)
  req.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken)
  const res = NextResponse.next({ request: { headers: req.headers } })
  res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, AUTH_COOKIE_OPTIONS.access)
  res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, AUTH_COOKIE_OPTIONS.refresh)
  return res
}

/**
 * public なパスで refresh token が使えなかったとき。ログインを求めないのでリダイレクトせず、cookie を消して通す。
 * このリクエストの cookie からも消し、以降の処理（Route Handler など）が使えない token を api に送らないようにする
 */
const forwardWithoutAuthCookies = (req: NextRequest): NextResponse => {
  req.cookies.delete(ACCESS_TOKEN_COOKIE)
  req.cookies.delete(REFRESH_TOKEN_COOKIE)
  return deleteAuthCookies(NextResponse.next({ request: { headers: req.headers } }))
}

/**
 * JWT の署名は検証せず、Cookie の有無と exp だけで判断する（実検証は API 側で行う）
 *
 * access token が無い（ブラウザが期限で消した）か期限が近ければ、ここで refresh する。
 * Server Component は cookie を書き換えられないので、描画より前のここで更新し、
 * 新しい cookie をこのリクエスト（Server Component / Server Action / Route Handler が読む）とブラウザの両方に渡す。
 * public なパス（`/api/events` など）でも、refresh cookie があれば更新だけは行う（ログインは求めない）。
 * - refresh token が使えない（refresh API が 401 / 400）: cookie を消してログイン画面へ（Route Handler は 401）。public なパスは cookie を消すだけで通す
 * - api の障害・レート制限（429）・timeout: 更新せずに通す（ログアウトさせず、ページ側のエラー表示に任せる）
 */
export const proxy = async (req: NextRequest) => {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some(p => matchesPathPrefix(pathname, p))

  if (isPublic && PUBLIC_TOKEN_REFRESH_SKIP_PATHS.some(p => matchesPathPrefix(pathname, p))) {
    return NextResponse.next()
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  if (!isPublic && !accessToken && !refreshToken) return redirectToSignIn(req)

  const now = Date.now()
  if (!refreshToken || isAccessTokenUsable(accessToken, now)) return NextResponse.next()

  const result = await refreshAuthTokens(refreshToken, now)
  if (result.kind === "unavailable") return NextResponse.next()
  if (result.kind === "refreshed") return forwardRefreshedTokens(req, result)

  if (isPublic) return forwardWithoutAuthCookies(req)
  return deleteAuthCookies(
    pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : redirectToSignIn(req),
  )
}

export const config = {
  /**
   * _next, _next/static, _next/image, favicon, public 配下を除外
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
