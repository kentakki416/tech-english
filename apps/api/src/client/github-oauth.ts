import { z } from "zod"

import { logger } from "@repo/logger"

export type GitHubUserInfo = {
  /**
   * GitHub の数値 id を文字列にしたもの（auth_accounts.provider_account_id）
   */
  id: string
  avatarUrl: string | null
  /**
   * primary かつ verified のメール。無ければ null
   */
  email: string | null
  login: string
  name: string | null
}

export type GetGitHubUserInfoInput = {
  code: string
  codeVerifier: string
  redirectUri: string
}

/**
 * GitHubOAuthクライアントのインターフェース
 */
export interface IGitHubOAuthClient {
  /**
   * code が使えない（期限切れ・使用済み・verifier 不一致）ときは null。通信障害や設定ミスは throw
   */
  getUserInfo(input: GetGitHubUserInfoInput): Promise<GitHubUserInfo | null>
}

const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
const GITHUB_API_BASE_URL = "https://api.github.com"

/**
 * GitHub は token 交換の失敗も 200 + `{ error }` で返すため、本文で成否を判定する。
 * 外部 API のレスポンスは無検証キャストせず Zod で検証する（利用しないフィールドは無視）。
 */
const accessTokenResponseSchema = z.union([
  z.object({ access_token: z.string().min(1) }),
  z.object({ error: z.string() }),
])

const userResponseSchema = z.object({
  id: z.number().int(),
  avatar_url: z.string().nullable(),
  login: z.string().min(1),
  name: z.string().nullable(),
})

const emailsResponseSchema = z.array(
  z.object({
    email: z.string(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
)

/**
 * OAuth App の Client ID / Secret の設定ミス。code の問題ではないので null にせず throw する
 */
const INCORRECT_CLIENT_CREDENTIALS_ERROR = "incorrect_client_credentials"

export class GitHubOAuthClient implements IGitHubOAuthClient {
  private _clientId: string
  private _clientSecret: string

  constructor(clientId: string, clientSecret: string) {
    this._clientId = clientId
    this._clientSecret = clientSecret
  }

  public async getUserInfo(input: GetGitHubUserInfoInput): Promise<GitHubUserInfo | null> {
    const accessToken = await this._exchangeCodeForAccessToken(input)
    if (!accessToken) return null

    /**
     * GitHub の access token はユーザー情報の取得にだけ使い、保存せず捨てる（以降の認証はアプリの JWT で行う）
     */
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "tech-english",
      "X-GitHub-Api-Version": "2022-11-28",
    }
    const [userResponse, emailsResponse] = await Promise.all([
      fetch(`${GITHUB_API_BASE_URL}/user`, { headers }),
      fetch(`${GITHUB_API_BASE_URL}/user/emails`, { headers }),
    ])

    if (!userResponse.ok) {
      throw new Error(`GitHub user request failed: ${userResponse.status}`)
    }
    if (!emailsResponse.ok) {
      throw new Error(`GitHub user emails request failed: ${emailsResponse.status}`)
    }

    const user = userResponseSchema.parse(await userResponse.json())
    const emails = emailsResponseSchema.parse(await emailsResponse.json())

    return {
      id: String(user.id),
      avatarUrl: user.avatar_url,
      email: emails.find((item) => item.primary && item.verified)?.email ?? null,
      login: user.login,
      /**
       * 空文字は未設定として扱う（呼び出し側で login にフォールバックさせるため）
       */
      name: user.name || null,
    }
  }

  /**
   * code（+ PKCE の code_verifier）を GitHub の access token に交換する。code が使えないときは null
   */
  private async _exchangeCodeForAccessToken(input: GetGitHubUserInfoInput): Promise<string | null> {
    const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      body: new URLSearchParams({
        client_id: this._clientId,
        client_secret: this._clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
      }),
      headers: {
        Accept: "application/json",
      },
      method: "POST",
    })

    if (!response.ok) {
      throw new Error(`GitHub access token request failed: ${response.status}`)
    }

    const data = accessTokenResponseSchema.parse(await response.json())
    if ("error" in data) {
      if (data.error === INCORRECT_CLIENT_CREDENTIALS_ERROR) {
        throw new Error("GitHub OAuth client credentials are incorrect")
      }
      /**
       * bad_verification_code など。code は秘密情報なので出さず、GitHub のエラー種別だけを残す
       */
      logger.info("GitHubOAuthClient: Authorization code was rejected", { error: data.error })
      return null
    }

    return data.access_token
  }
}
