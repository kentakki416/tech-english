import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { SignInError } from "@/features/auth/sign-in-errors"
import { clearAuthCookies } from "@/libs/auth"

/**
 * cookie を消してサインイン画面に送る。
 *
 * refresh token の無効化（api の logout）はしない。admin が押すログアウト（logoutAction）とは役割が違うため。
 *
 * 外のサイトのリンクから開かれた（cross-site）ときは cookie を消さない。消すと、リンクを踏ませるだけで
 * ログアウトさせられる
 */
export const GET = async (req: NextRequest) => {
  const url = new URL("/signin", req.url)
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    url.searchParams.set("error", "session_expired" satisfies SignInError)
  } else {
    await clearAuthCookies()
  }
  return NextResponse.redirect(url)
}
