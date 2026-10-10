import { OAuth2Client } from "google-auth-library"
import { z } from "zod"

export type GoogleUserInfo = {
  email: string
  id: string
  name: string
  picture?: string
}

/**
 * Google userinfo エンドポイントのレスポンス検証スキーマ。
 * 外部 API のレスポンスは無検証キャストせず Zod で検証し、想定外の形（id/email
 * 欠落、エラー JSON 等）が後段の findByProvider / ユーザー作成へ流れるのを防ぐ。
 * 利用しないフィールド（family_name 等）は検証対象に含めない（余剰は無視）。
 */
const googleUserInfoResponseSchema = z.object({
  email: z.string().email(),
  id: z.string().min(1),
  name: z.string(),
  picture: z.string().optional(),
})

/**
 * GoogleOAuthクライアントのインターフェース
 *
 * code を token に交換する際の redirect_uri は Google OAuth の仕様上
 * 認証時に使った URL と完全一致する必要があるため、getUserInfo の引数で受け取る。
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
     * リクエスト毎に OAuth2Client を生成する。
     * テスト容易性と、redirect_uri をリクエスト単位で切り替える要件のため。
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
      id: data.id,
      name: data.name,
      picture: data.picture
    }
  }
}
