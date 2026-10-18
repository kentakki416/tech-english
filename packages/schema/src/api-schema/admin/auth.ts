import { z } from "zod"

import {
  authDevLoginRequestSchema,
  authGoogleRequestSchema,
  authLogoutRequestSchema,
  authLogoutResponseSchema,
  authRefreshRequestSchema,
  authRefreshResponseSchema,
} from "../auth"

// ========================================================
// POST /api/admin/auth/google - admin の Google OAuth 認証
// ========================================================

/**
 * admin の Google 認証のリクエストスキーマ。一般ユーザーの Google 認証と同じ（code と redirect_uri）
 */
export const adminAuthGoogleRequestSchema = authGoogleRequestSchema

export type AdminAuthGoogleRequest = z.infer<typeof adminAuthGoogleRequestSchema>

/**
 * admin の Google 認証のレスポンススキーマ。admins に登録が無い・Google で未確認の email は 403
 */
export const adminAuthGoogleResponseSchema = z.object({
  access_token: z.string(),
  admin: z.object({
    id: z.number(),
    avatar_url: z.string().nullable(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  refresh_token: z.string(),
})

export type AdminAuthGoogleResponse = z.infer<typeof adminAuthGoogleResponseSchema>

// ========================================================
// POST /api/admin/auth/dev-login - 開発環境専用の admin ログイン
// ========================================================

/**
 * admin の dev-login のリクエストスキーマ。production では受け付けない（API 側で 404）
 * email は seed で投入済みの admin（admin@dev.local）を想定
 */
export const adminAuthDevLoginRequestSchema = authDevLoginRequestSchema

export type AdminAuthDevLoginRequest = z.infer<typeof adminAuthDevLoginRequestSchema>

/**
 * admin の dev-login のレスポンススキーマ。Google 認証と同じ形にして、admin 側で同じ cookie の保存に渡せるようにする
 */
export const adminAuthDevLoginResponseSchema = z.object({
  access_token: z.string(),
  admin: z.object({
    id: z.number(),
    avatar_url: z.string().nullable(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  refresh_token: z.string(),
})

export type AdminAuthDevLoginResponse = z.infer<typeof adminAuthDevLoginResponseSchema>

// ========================================================
// POST /api/admin/auth/refresh - admin の Access/Refresh Token のローテーション
// ========================================================

/**
 * admin の Refresh Token によるトークン更新のリクエストスキーマ。一般ユーザーと同じ形
 */
export const adminAuthRefreshRequestSchema = authRefreshRequestSchema

export type AdminAuthRefreshRequest = z.infer<typeof adminAuthRefreshRequestSchema>

/**
 * admin の Refresh Token によるトークン更新のレスポンススキーマ。一般ユーザーと同じ形
 */
export const adminAuthRefreshResponseSchema = authRefreshResponseSchema

export type AdminAuthRefreshResponse = z.infer<typeof adminAuthRefreshResponseSchema>

// ========================================================
// POST /api/admin/auth/logout - admin の Refresh Token を無効化
// ========================================================

/**
 * admin のログアウトのリクエストスキーマ。一般ユーザーと同じ形
 */
export const adminAuthLogoutRequestSchema = authLogoutRequestSchema

export type AdminAuthLogoutRequest = z.infer<typeof adminAuthLogoutRequestSchema>

/**
 * admin のログアウトのレスポンススキーマ。一般ユーザーと同じ形
 */
export const adminAuthLogoutResponseSchema = authLogoutResponseSchema

export type AdminAuthLogoutResponse = z.infer<typeof adminAuthLogoutResponseSchema>
