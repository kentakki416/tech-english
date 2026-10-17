import "server-only"

import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { adminAuthGoogleResponseSchema } from "@repo/api-schema"

import { env } from "@/env"
import { SignInError } from "@/features/auth/sign-in-errors"
import { GOOGLE_REDIRECT_URI } from "@/libs/app-origin"
import { setAuthCookies } from "@/libs/auth"
import { OAUTH_REDIRECT_COOKIE, OAUTH_STATE_COOKIE } from "@/libs/auth-cookies"
import { getErrorName } from "@/libs/error-name"
import { resolveSafeRedirectPath } from "@/libs/safe-redirect"

/**
 * サインイン画面にエラーを出して戻す。サインインし直した後に元の画面へ戻れるよう、戻り先も付ける
 */
const redirectToSignInWithError = (req: NextRequest, error: SignInError, redirectTo: string): NextResponse => {
  const url = new URL("/signin", req.url)
  url.searchParams.set("error", error)
  if (redirectTo !== "/") url.searchParams.set("redirect", redirectTo)
  return NextResponse.redirect(url)
}

/**
 * Google OAuth の callback。api の admin の Google 認証で code を検証し、
 * access / refresh token を cookie に保存して、サインイン前に開こうとしていた画面に戻す。
 * admins に登録されていない Google アカウント（api が 403）は、サインイン画面に権限が無い旨を出す
 */
export const GET = async (req: NextRequest) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const store = await cookies()
  const redirectTo = resolveSafeRedirectPath(store.get(OAUTH_REDIRECT_COOKIE)?.value)
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value
  store.delete(OAUTH_REDIRECT_COOKIE)
  store.delete(OAUTH_STATE_COOKIE)

  if (url.searchParams.get("error")) {
    return redirectToSignInWithError(req, "oauth_denied", redirectTo)
  }
  if (!code || !state) {
    return redirectToSignInWithError(req, "auth_failed", redirectTo)
  }
  if (!expectedState || expectedState !== state) {
    return redirectToSignInWithError(req, "state_mismatch", redirectTo)
  }

  /**
   * api の障害（通信エラー・想定外の応答）でも素の 500 にせず、サインイン画面に戻す
   */
  try {
    const apiRes = await fetch(`${env.API_URL}/api/admin/auth/google`, {
      /**
       * redirect_uri は startGoogleOAuth と同じ値にする（Google は完全一致で照合する）
       */
      body: JSON.stringify({ code, redirect_uri: GOOGLE_REDIRECT_URI }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    if (apiRes.status === 403) {
      return redirectToSignInWithError(req, "not_admin", redirectTo)
    }
    if (!apiRes.ok) {
      console.error("Admin Google sign-in failed", { status: apiRes.status })
      return redirectToSignInWithError(req, "auth_failed", redirectTo)
    }

    const json = adminAuthGoogleResponseSchema.parse(await apiRes.json())
    await setAuthCookies(json.access_token, json.refresh_token)
  } catch (error) {
    console.error("Admin Google sign-in failed", { error: getErrorName(error) })
    return redirectToSignInWithError(req, "auth_failed", redirectTo)
  }

  return NextResponse.redirect(new URL(redirectTo, req.url))
}
