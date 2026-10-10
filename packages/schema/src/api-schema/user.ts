import { z } from "zod"

/**
 * Intl.DateTimeFormat が受け付けるタイムゾーン名かを判定する
 *
 * Intl.supportedValuesOf("timeZone") の一覧では検証しない。ICU の正規名だけの一覧で、
 * UTC が含まれず、Asia/Kolkata のような新しい名前も欠けることがあるため（ブラウザや端末が返す名前と食い違う）
 */
const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * IANA タイムゾーン名。Intl.DateTimeFormat が受け付ける名前（UTC や別名も含む）を有効とし、受け取ったまま保存する
 */
export const timezoneSchema = z.string().min(1).max(64).refine((value) => isValidTimeZone(value), {
  message: "Invalid time zone",
})

// ========================================================
// GET /api/user - 認証中ユーザーの取得
// ========================================================

/**
 * 認証中ユーザー取得のレスポンススキーマ
 */
export const getUserResponseSchema = z.object({
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  email: z.string().nullable(),
  id: z.number(),
  name: z.string().nullable(),
  timezone: z.string(),
})

export type GetUserResponse = z.infer<typeof getUserResponseSchema>

// ========================================================
// PATCH /api/user - タイムゾーンの変更
// ========================================================

/**
 * タイムゾーン変更のリクエストスキーマ
 */
export const updateUserRequestSchema = z.object({
  timezone: timezoneSchema,
})

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>

/**
 * タイムゾーン変更のレスポンススキーマ（getUserResponseSchema と同じ形を独立して定義する）
 */
export const updateUserResponseSchema = z.object({
  id: z.number(),
  avatar_url: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
})

export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>
