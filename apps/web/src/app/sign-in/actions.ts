"use server"

import { randomBytes } from "node:crypto"

import { redirect } from "next/navigation"

import { saveOAuthSession } from "@/libs/auth"
import { buildGitHubAuthorizeUrl, buildGitHubCallbackUrl, createPkcePair } from "@/libs/github-oauth"

const TIMEZONE_MAX_LENGTH = 64

/**
 * GitHub OAuth の開始。state・code_verifier・ブラウザのタイムゾーンを cookie に保存して認可画面へ送る。
 * タイムゾーンの妥当性は api が検証する（通らなければ既定値で作られる）
 */
export const startGitHubOAuth = async (formData: FormData) => {
  const timezone = formData.get("timezone")
  const state = randomBytes(16).toString("hex")
  const { codeChallenge, codeVerifier } = createPkcePair()
  await saveOAuthSession({
    codeVerifier,
    state,
    timezone: typeof timezone === "string" && timezone.length > 0 && timezone.length <= TIMEZONE_MAX_LENGTH ? timezone : null,
  })
  redirect(buildGitHubAuthorizeUrl({ codeChallenge, redirectUri: buildGitHubCallbackUrl(), state }))
}
