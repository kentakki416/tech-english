import { NextRequest, NextResponse } from "next/server"

import { authDevLoginResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { setAuthCookies } from "@/libs/auth"

const API_BASE_URL = env.API_URL

/**
 * packages/db/drizzle/seed.ts の dev ユーザーと一致させる
 */
const DEV_USERS: Record<string, string> = {
  alice: "alice@dev.local",
  bob: "bob@dev.local",
}

/**
 * 開発環境専用のログイン。`?as=alice` のように DEV_USERS のキーを渡すと、そのユーザーで
 * api の dev-login を呼び、access / refresh token を cookie に保存して / に redirect する
 */
export const GET = async (req: NextRequest) => {
  /**
   * proxy（production では公開パスに含めない）と api（production では dev-login が無い）でも
   * 塞いでいるが、どちらかの設定を誤っても開かないように、ここでも 404 を返す
   */
  if (env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 })
  }

  const as = req.nextUrl.searchParams.get("as")
  if (!as || !(as in DEV_USERS)) {
    const usage = `Usage: /api/dev/login?as=${Object.keys(DEV_USERS).join("|")}`
    return new NextResponse(usage, { status: 400 })
  }

  const email = DEV_USERS[as]

  const apiRes = await fetch(`${API_BASE_URL}/api/auth/dev-login`, {
    body: JSON.stringify({ email }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  if (!apiRes.ok) {
    const message = `dev-login failed (status=${apiRes.status}). Did you run \`pnpm --filter api db:seed\`?`
    return new NextResponse(message, { status: 500 })
  }

  const json = authDevLoginResponseSchema.parse(await apiRes.json())
  await setAuthCookies(json.access_token, json.refresh_token)

  return NextResponse.redirect(new URL("/", req.url))
}
