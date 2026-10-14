import { z } from "zod"

import { GOAL_METRICS, GOAL_TEXT_MAX_LENGTH } from "@repo/domain"

// ========================================================
// 共通: 目標
// ========================================================

/**
 * 1 週間の分数（週の目標値の上限）
 */
const MINUTES_PER_WEEK = 7 * 24 * 60

/**
 * 目標（どの項目も空は null）
 */
const goalSchema = z.object({
  goal_text: z.string().nullable(),
  target_date: z.string().nullable(),
  weekly_metric: z.enum(GOAL_METRICS).nullable(),
  weekly_target: z.number().int().nullable(),
})

// ========================================================
// GET /api/user/goal - 目標の取得
// ========================================================

/**
 * 目標取得のレスポンススキーマ。未設定なら goal は null
 */
export const getUserGoalResponseSchema = z.object({
  goal: goalSchema.nullable(),
})

export type GetUserGoalResponse = z.infer<typeof getUserGoalResponseSchema>

// ========================================================
// PUT /api/user/goal - 目標の保存（upsert）
// ========================================================

/**
 * 目標保存のリクエストスキーマ。すべての項目が必須（空にする項目は null を送る。部分更新はしない）。
 * 週の目標の指標と値は両方指定するか両方 null（DB の CHECK 制約と同じ条件）
 */
export const updateUserGoalRequestSchema = z
  .object({
    /**
     * 空文字・空白だけは送らない（クライアントが null に変える）。前後の空白は除いて保存する。
     * 長さは JS の length（UTF-16 単位）で数えるので、DB の varchar（文字数）より厳しい
     */
    goal_text: z.string().trim().min(1).max(GOAL_TEXT_MAX_LENGTH).nullable(),
    /**
     * YYYY-MM-DD。過去の日付も受け付ける（マイページの残り日数が負になる）
     */
    target_date: z.string().date().nullable(),
    weekly_metric: z.enum(GOAL_METRICS).nullable(),
    /**
     * 1 以上。上限は 1 週間の分数
     */
    weekly_target: z.number().int().min(1).max(MINUTES_PER_WEEK).nullable(),
  })
  .refine((value) => (value.weekly_metric === null) === (value.weekly_target === null), {
    message: "週の目標の指標と値は両方指定するか、両方空にしてください",
    path: ["weekly_target"],
  })

export type UpdateUserGoalRequest = z.infer<typeof updateUserGoalRequestSchema>

/**
 * 目標保存のレスポンススキーマ（保存後の値）
 */
export const updateUserGoalResponseSchema = z.object({
  goal: goalSchema,
})

export type UpdateUserGoalResponse = z.infer<typeof updateUserGoalResponseSchema>
