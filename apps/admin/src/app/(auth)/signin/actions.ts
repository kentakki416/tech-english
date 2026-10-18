"use server"

import "server-only"

import { randomBytes } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { env } from "@/env"
import { GOOGLE_REDIRECT_URI } from "@/libs/app-origin"
import { OAUTH_COOKIE_OPTIONS, OAUTH_REDIRECT_COOKIE, OAUTH_STATE_COOKIE } from "@/libs/auth-cookies"
import { resolveSafeRedirectPath } from "@/libs/safe-redirect"

/**
 * Google OAuth の開始。state（CSRF 対策）とサインイン後の戻り先を cookie に保存して、Google の認可画面へ送る
 */
export const startGoogleOAuth = async (formData: FormData) => {
  const state = randomBytes(16).toString("hex")
  const redirectValue = formData.get("redirect")

  const store = await cookies()
  store.set(OAUTH_STATE_COOKIE, state, OAUTH_COOKIE_OPTIONS)
  store.set(
    OAUTH_REDIRECT_COOKIE,
    resolveSafeRedirectPath(typeof redirectValue === "string" ? redirectValue : null),
    OAUTH_COOKIE_OPTIONS,
  )

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    /**
     * 権限の無いアカウントで弾かれた後に、別のアカウントを選び直せるようにする
     */
    prompt: "select_account",
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
  })
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
