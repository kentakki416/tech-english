import { NextRequest, NextResponse } from "next/server"

import { clearAuthCookies } from "@/libs/auth"

/**
 * api が期限内の access token を 401 で拒んだとき（別の端末でアカウントを削除した・JWT の secret を差し替えた）に、
 * Server Component は cookie を書き換えられないので、ここで cookie を消してからログイン画面へ移す
 */
export const GET = async (req: NextRequest) => {
  await clearAuthCookies()
  return NextResponse.redirect(new URL("/sign-in", req.url))
}
