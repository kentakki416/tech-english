import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { clearAuthCookies } from "@/libs/auth"

/**
 * cookie を消してサインイン画面に送る。api-client が api に 401 を返されたときの行き先。
 *
 * refresh token の無効化（api の logout）はしない。admin が押すログアウト（logoutAction）とは役割が違うため。
 *
 * 外のサイトのリンクから開かれた（cross-site）ときは cookie を消さない。消すと、リンクを踏ませるだけで
 * ログアウトさせられる
 */
export const GET = async (req: NextRequest) => {
  if (req.headers.get("sec-fetch-site") !== "cross-site") {
    await clearAuthCookies()
  }
  return NextResponse.redirect(new URL("/signin", req.url))
}
