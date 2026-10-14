import { NextRequest, NextResponse } from "next/server"

import { type AuthGitHubRequest, authGitHubResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { setAuthCookies, takeOAuthSession } from "@/libs/auth"
import { buildGitHubCallbackUrl } from "@/libs/github-oauth"

const API_BASE_URL = env.API_URL

/**
 * GitHub OAuth コールバックを受け取り、state を照合して code と code_verifier を Express API に渡し、
 * 返ってきた Access/Refresh Token を Cookie に保存した上でリダイレクトする
 */
export const GET = async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")
  const errorParam = req.nextUrl.searchParams.get("error")

  if (errorParam) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_denied", req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_request", req.url))
  }

  const session = await takeOAuthSession()
  if (!session.state || session.state !== state || !session.codeVerifier) {
    return NextResponse.redirect(new URL("/sign-in?error=state_mismatch", req.url))
  }

  const body: AuthGitHubRequest = {
    code,
    code_verifier: session.codeVerifier,
    redirect_uri: buildGitHubCallbackUrl(),
    timezone: session.timezone,
  }
  const apiRes = await fetch(`${API_BASE_URL}/api/auth/github`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  if (!apiRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_failed", req.url))
  }

  const json = authGitHubResponseSchema.parse(await apiRes.json())
  await setAuthCookies(json.access_token, json.refresh_token)

  return NextResponse.redirect(new URL("/", req.url))
}
