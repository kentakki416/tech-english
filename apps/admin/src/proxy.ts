import { NextRequest, NextResponse } from "next/server"

import { isBasicAuthValid } from "@/libs/basic-auth"

const REALM = "tech-english admin"

/**
 * admin 全体（モックの /mock も含む）を Basic 認証で守る。
 *
 * src/env.ts は `server-only` を import しているので proxy からは使わず、process.env を直接読む
 * （必須の検査は src/env.ts 側で、api client の読み込み時に走る）。
 */
export const proxy = (req: NextRequest) => {
  const user = process.env.ADMIN_BASIC_AUTH_USER
  const password = process.env.ADMIN_BASIC_AUTH_PASSWORD

  /**
   * 未設定なら誰も通さない（fail closed）
   */
  if (user && password && isBasicAuthValid(req.headers.get("authorization"), user, password)) {
    return NextResponse.next()
  }

  return new NextResponse("Authentication required", {
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
    status: 401,
  })
}

export const config = {
  /**
   * _next/static・_next/image・favicon.ico 以外のすべて
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
