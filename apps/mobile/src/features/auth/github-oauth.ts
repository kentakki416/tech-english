import * as Crypto from "expo-crypto"
import * as Linking from "expo-linking"
import * as WebBrowser from "expo-web-browser"

import { env } from "@/env"
import { buildQueryString } from "@/libs/query-string"

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"

/**
 * 読み取り専用のプロフィールとメールだけを要求する
 */
const GITHUB_SCOPE = "read:user user:email"

/**
 * web の `/api/auth/callback/github/mobile` が code と state を付けて 302 で戻す先（app.json の scheme）
 */
const APP_CALLBACK_URL = "techenglish://auth/callback"

/**
 * GitHub から戻る先。GitHub OAuth App は callback URL を 1 つしか登録できないため、web の callback URL のサブパスを使う
 */
export const GITHUB_MOBILE_REDIRECT_URI = `${env.EXPO_PUBLIC_WEB_URL}/api/auth/callback/github/mobile`

export type GitHubAuthSessionResult =
  | { code: string, codeVerifier: string, kind: "success" }
  | { kind: "cancelled" }
  | { kind: "failed" }

/**
 * 端末のブラウザ（ASWebAuthenticationSession / Custom Tabs）で GitHub の認可画面を開き、戻ってきた code を返す
 *
 * custom scheme は他の app に横取りされうるため PKCE（S256）を使う。横取りされた code だけでは code_verifier が無いのでトークンに交換できない
 */
export const openGitHubAuthSession = async (): Promise<GitHubAuthSessionResult> => {
  const state = Crypto.randomUUID()
  const { codeChallenge, codeVerifier } = await createPkcePair()
  const authorizeUrl = `${GITHUB_AUTHORIZE_URL}?${buildQueryString({
    client_id: env.EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: GITHUB_MOBILE_REDIRECT_URI,
    scope: GITHUB_SCOPE,
    state,
  })}`

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, APP_CALLBACK_URL)
  if (result.type !== "success") return { kind: "cancelled" }

  const { queryParams } = Linking.parse(result.url)
  const code = queryParams?.code
  if (queryParams?.error || queryParams?.state !== state || typeof code !== "string" || !code) return { kind: "failed" }
  return { code, codeVerifier, kind: "success" }
}

/**
 * PKCE（S256）の組を作る。verifier は 32 byte の乱数を base64url にした 43 文字、challenge はその SHA-256 を base64url にしたもの
 */
const createPkcePair = async (): Promise<{ codeChallenge: string, codeVerifier: string }> => {
  const codeVerifier = convertBase64ToBase64Url(convertBytesToBase64(Crypto.getRandomBytes(32)))
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  })
  return { codeChallenge: convertBase64ToBase64Url(digest), codeVerifier }
}

const convertBytesToBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))

const convertBase64ToBase64Url = (base64: string): string =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
