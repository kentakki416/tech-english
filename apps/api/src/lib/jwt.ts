import { randomUUID } from "node:crypto"

import jwt, { type Secret, type SignOptions } from "jsonwebtoken"

import { env } from "../env"

/**
 * シークレット / 有効期限は検証済みの env を単一の出所として参照する。
 * process.env を直接読むと env.ts の Zod 検証（secret は min(32) 等）を通らない
 * 未検証値や undefined を `as string` で握り潰す恐れがあるため使わない。
 */
const JWT_ACCESS_SECRET: Secret = env.JWT_ACCESS_SECRET
const JWT_REFRESH_SECRET: Secret = env.JWT_REFRESH_SECRET
const JWT_ACCESS_EXPIRATION = env.JWT_ACCESS_EXPIRATION as SignOptions["expiresIn"]
const JWT_REFRESH_EXPIRATION = env.JWT_REFRESH_EXPIRATION as SignOptions["expiresIn"]

export type AccessTokenPayload = {
  exp?: number
  iat?: number
  userId: number
}

export type RefreshTokenPayload = {
  exp?: number
  iat?: number
  jti: string
  userId: number
}

/**
 * Access Token を生成する
 */
export const generateAccessToken = (userId: number): string => {
  return jwt.sign({ userId }, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRATION })
}

/**
 * Refresh Token を生成する
 * jti は Redis に保存し、ローテーション・ログアウト時に当該 jti を破棄する
 */
export const generateRefreshToken = (userId: number): { jti: string; token: string } => {
  const jti = randomUUID()
  const token = jwt.sign({ jti, userId }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION })
  return { jti, token }
}

/**
 * Access Token を検証する
 */
export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as AccessTokenPayload
  } catch {
    return null
  }
}

/**
 * Refresh Token を検証する
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload
  } catch {
    return null
  }
}
