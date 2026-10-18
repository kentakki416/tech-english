import "server-only"

import { NextRequest, NextResponse } from "next/server"

import { adminAuthDevLoginResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { setAuthCookies } from "@/libs/auth"

/**
 * dev admin の email。packages/db/drizzle/seed.ts の admin と一致させる
 */
const DEV_ADMIN_EMAIL = "admin@dev.local"

/**
 * 開発環境専用の admin ログイン。GET /api/dev/login を開くと、seed で入れた dev admin として
 * api の dev-login を呼び、access / refresh token を cookie に保存して / に送る。
 *
 * 多重ガード:
 * 1. proxy.ts で /api/dev/login は production 以外でだけ公開のパスにする（production でサインインしていなければ proxy が 401）
 * 2. production でサインインしていれば、ここで 404
 * 3. api 側も production では dev-login のルート自体が無い
 */
export const GET = async (req: NextRequest) => {
  if (env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 })
  }

  const apiRes = await fetch(`${env.API_URL}/api/admin/auth/dev-login`, {
    body: JSON.stringify({ email: DEV_ADMIN_EMAIL }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  if (!apiRes.ok) {
    const message = `dev-login failed (status=${apiRes.status}). Did you run \`pnpm --filter @repo/db db:seed\`?`
    return new NextResponse(message, { status: 500 })
  }

  const json = adminAuthDevLoginResponseSchema.parse(await apiRes.json())
  await setAuthCookies(json.access_token, json.refresh_token)

  return NextResponse.redirect(new URL("/", req.url))
}
