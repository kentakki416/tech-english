import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { env } from "@/env"

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"

/**
 * 読み取り専用のプロフィールとメールだけを要求する
 */
const GITHUB_SCOPE = "read:user user:email"

/**
 * web のログインで GitHub から戻る先。GitHub OAuth App に登録する callback URL と一致させる
 */
export const buildGitHubCallbackUrl = (): string => `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/github`

/**
 * PKCE（S256）の組を作る。verifier は 32 byte の乱数を base64url にした 43 文字、challenge はその SHA-256
 */
export const createPkcePair = (): { codeChallenge: string, codeVerifier: string } => {
  const codeVerifier = randomBytes(32).toString("base64url")
  return {
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    codeVerifier,
  }
}

/**
 * GitHub の認可画面の URL を組み立てる
 */
export const buildGitHubAuthorizeUrl = (input: { codeChallenge: string, redirectUri: string, state: string }): string => {
  const params = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_CLIENT_ID,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: input.redirectUri,
    scope: GITHUB_SCOPE,
    state: input.state,
  })
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`
}
