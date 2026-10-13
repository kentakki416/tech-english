import { NextRequest, NextResponse } from "next/server"

import { clearAuthCookies } from "@/libs/auth"

/**
 * GET /api/auth/session-expired
 *
 * api が期限内の access token を 401 で拒んだとき（別の端末でアカウントを削除した・JWT の secret を差し替えた）に、
 * Server Component から redirect してくる（src/libs/session.ts の redirectIfSessionRejected）。
 * Server Component は cookie を書き換えられないので、ここで cookie を消してからログイン画面へ移す。
 *
 * cookie を消すので、proxy の PUBLIC_PATHS に入れ、proxy の token 更新の対象から外している
 */
export const GET = async (req: NextRequest) => {
  await clearAuthCookies()
  return NextResponse.redirect(new URL("/sign-in", req.url))
}
