import { OAuth2Client } from "google-auth-library"
import { z } from "zod"

export type GoogleUserInfo = {
  email: string
  /**
   * userinfo に verified_email が無いときは false（未確認として扱う）
   */
  emailVerified: boolean
  id: string
  name: string
  picture?: string
}

/**
 * 外部 API のレスポンスはキャストせずに検証し、想定外の形（id / email の欠落、エラーの JSON など）を
 * 後続の処理へ流さない
 */
const googleUserInfoResponseSchema = z.object({
  email: z.string().email(),
  id: z.string().min(1),
  name: z.string(),
  picture: z.string().optional(),
  /**
   * 必須にすると、Google が項目を返さなかったときに一般ユーザーのサインインまで 500 になるので任意にする
   */
  verified_email: z.boolean().optional(),
})

/**
 * Google OAuth は、code を token に交換するときの redirect_uri が認証時の URL と完全に一致することを
 * 求めるので、getUserInfo の引数で受け取る
 */
export interface IGoogleOAuthClient {
  getUserInfo(code: string, redirectUri: string): Promise<GoogleUserInfo>
}

export class GoogleOAuthClient implements IGoogleOAuthClient {
  private _clientId: string
  private _clientSecret: string

  constructor(clientId: string, clientSecret: string) {
    this._clientId = clientId
    this._clientSecret = clientSecret
  }

  public async getUserInfo(code: string, redirectUri: string): Promise<GoogleUserInfo> {
    /**
     * redirect_uri がリクエストごとに変わるので、OAuth2Client はリクエストごとに作る
     */
    const oauth2Client = new OAuth2Client(this._clientId, this._clientSecret, redirectUri)
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Google userinfo request failed: ${response.status}`)
    }

    const data = googleUserInfoResponseSchema.parse(await response.json())

    return {
      email: data.email,
      emailVerified: data.verified_email === true,
      id: data.id,
      name: data.name,
      picture: data.picture
    }
  }
}
