import { randomUUID } from "node:crypto"

import jwt, { type Secret, type SignOptions } from "jsonwebtoken"

import { env } from "../env"

/**
 * admin のトークンの鍵は一般ユーザーと別。有効期限は一般ユーザーと同じ env を使う
 */
const JWT_ADMIN_ACCESS_SECRET: Secret = env.JWT_ADMIN_ACCESS_SECRET
const JWT_ADMIN_REFRESH_SECRET: Secret = env.JWT_ADMIN_REFRESH_SECRET
const JWT_ACCESS_EXPIRATION = env.JWT_ACCESS_EXPIRATION as SignOptions["expiresIn"]
const JWT_REFRESH_EXPIRATION = env.JWT_REFRESH_EXPIRATION as SignOptions["expiresIn"]

export type AdminAccessTokenPayload = {
  adminId: number
  exp?: number
  iat?: number
}

export type AdminRefreshTokenPayload = {
  adminId: number
  exp?: number
  iat?: number
  jti: string
}

/**
 * admin の Access Token を生成する。refresh token と取り違えたときに見分けられるよう、jti を持たせない
 */
export const generateAdminAccessToken = (adminId: number): string =>
  jwt.sign({ adminId }, JWT_ADMIN_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRATION })

export const generateAdminRefreshToken = (adminId: number): { jti: string; token: string } => {
  const jti = randomUUID()
  const token = jwt.sign({ adminId, jti }, JWT_ADMIN_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION })
  return { jti, token }
}

/**
 * admin の Access Token を検証する。署名に加えて、payload の adminId が数値で、jti を持たないことを確かめる。
 * 鍵を写し間違えて一般ユーザーのトークン（`{ userId }`）や refresh token（`{ adminId, jti }`）が署名を通っても、ここで落とすため
 */
export const verifyAdminAccessToken = (token: string): AdminAccessTokenPayload | null => {
  try {
    const payload = jwt.verify(token, JWT_ADMIN_ACCESS_SECRET)
    if (typeof payload !== "object" || typeof payload.adminId !== "number" || "jti" in payload) return null
    return payload as AdminAccessTokenPayload
  } catch {
    return null
  }
}

/**
 * admin の Refresh Token を検証する。adminId が数値、jti が文字列でなければ失敗にする
 */
export const verifyAdminRefreshToken = (token: string): AdminRefreshTokenPayload | null => {
  try {
    const payload = jwt.verify(token, JWT_ADMIN_REFRESH_SECRET)
    if (typeof payload !== "object" || typeof payload.adminId !== "number" || typeof payload.jti !== "string") {
      return null
    }
    return payload as AdminRefreshTokenPayload
  } catch {
    return null
  }
}
