import { z } from "zod"

// ========================================================
// 共通: 時刻の形式
// ========================================================

/**
 * "HH:mm" かつ 15 分刻み（00 / 15 / 30 / 45）。"24:00" や秒付きは不可
 */
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/

// ========================================================
// GET /api/user/reminder - リマインダーの設定の取得
// ========================================================

/**
 * リマインダーの設定の取得のレスポンススキーマ。未保存なら既定値（オフ・毎日・21:00）
 */
export const getUserReminderResponseSchema = z.object({
  is_enabled: z.boolean(),
  /**
   * "HH:mm"（端末の時刻、15 分刻み）
   */
  time: z.string().regex(REMINDER_TIME_PATTERN),
  /**
   * ISO の曜日番号（1 = 月曜 〜 7 = 日曜）の昇順の配列
   */
  weekdays: z.array(z.number().int().min(1).max(7)),
})

export type GetUserReminderResponse = z.infer<typeof getUserReminderResponseSchema>

// ========================================================
// PUT /api/user/reminder - リマインダーの設定の保存（upsert）
// ========================================================

/**
 * リマインダーの設定の保存のリクエストスキーマ。3 項目とも必須（全体を置き換える）。
 * オフにするときも weekdays と time を送る（オフの間も保持し、次にオンにしたとき元の値に戻すため）
 */
export const updateUserReminderRequestSchema = z.object({
  is_enabled: z.boolean(),
  time: z.string().regex(REMINDER_TIME_PATTERN, "時刻は 15 分刻みの HH:mm で指定してください"),
  /**
   * 1〜7 の整数、1 つ以上、重複なし。順番は問わない（保存時に昇順に並べる）
   */
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "曜日を 1 つ以上選んでください")
    .refine((values) => new Set(values).size === values.length, "曜日が重複しています"),
})

export type UpdateUserReminderRequest = z.infer<typeof updateUserReminderRequestSchema>

/**
 * リマインダーの設定の保存のレスポンススキーマ（保存後の値）
 */
export const updateUserReminderResponseSchema = z.object({
  is_enabled: z.boolean(),
  time: z.string().regex(REMINDER_TIME_PATTERN),
  weekdays: z.array(z.number().int().min(1).max(7)),
})

export type UpdateUserReminderResponse = z.infer<typeof updateUserReminderResponseSchema>
