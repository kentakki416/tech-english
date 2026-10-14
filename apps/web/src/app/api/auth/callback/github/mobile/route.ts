import { NextRequest, NextResponse } from "next/server"

/**
 * mobile app の custom scheme。app.json の scheme と一致させる
 */
const APP_CALLBACK_URL = "techenglish://auth/callback"

const FORWARDED_PARAMS = ["code", "error", "state"] as const

/**
 * mobile のログインで GitHub から戻った code と state を、そのまま app の custom scheme へ 302 で渡す。
 * web は code を使わない（app が PKCE の code_verifier と一緒に api へ送る）
 */
export const GET = (req: NextRequest) => {
  const params = new URLSearchParams()
  for (const key of FORWARDED_PARAMS) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) params.set(key, value)
  }
  return NextResponse.redirect(`${APP_CALLBACK_URL}?${params.toString()}`, 302)
}
