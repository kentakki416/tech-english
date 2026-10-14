import { z } from "zod"

import { GOAL_METRICS, QUESTION_TYPES } from "@repo/domain"

// ========================================================
// 共通: 学習記録の部品
// ========================================================

/**
 * 正答率。設問が 0 問なら accuracy_percent は null（四捨五入した整数 %）
 */
const accuracySchema = z.object({
  accuracy_percent: z.number().int().nullable(),
  correct_count: z.number().int(),
  question_count: z.number().int(),
})

/**
 * 提出した挑戦の一覧の 1 行（stats の recent_attempts と attempts で共通）
 */
const learningRecordAttemptSchema = z.object({
  id: z.number().int(),
  correct_count: z.number().int(),
  elapsed_seconds: z.number().int(),
  is_overtime: z.boolean(),
  passage_id: z.number().int(),
  question_count: z.number().int(),
  /**
   * 学習した日（提出時のユーザーのタイムゾーンでの日付。YYYY-MM-DD）
   */
  study_date: z.string(),
  submitted_at: z.string(),
  /**
   * 提出時刻 `HH:mm`（リクエスト時点の users.timezone）
   */
  submitted_time: z.string(),
  title: z.string(),
  /**
   * 訳の表示・単語の意味のどちらかを 1 回以上使った
   */
  used_assist: z.boolean(),
})

export type LearningRecordAttemptResponse = z.infer<typeof learningRecordAttemptSchema>

// ========================================================
// GET /api/user/stats - マイページの統計
// ========================================================

/**
 * マイページの統計のレスポンススキーマ。数えるのは提出した挑戦だけ。today はユーザーのタイムゾーンでの今日
 */
export const getUserStatsResponseSchema = z.object({
  /**
   * 目標が未設定なら null
   */
  goal: z
    .object({
      /**
       * target_date − 今日。過ぎていれば負、目標日が無ければ null
       */
      days_left: z.number().int().nullable(),
      goal_text: z.string().nullable(),
      is_weekly_achieved: z.boolean(),
      target_date: z.string().nullable(),
      weekly_metric: z.enum(GOAL_METRICS).nullable(),
      /**
       * passages は今週の提出数、minutes は今週の学習秒数 ÷ 60 の切り捨て。週の目標が無ければ null
       */
      weekly_progress: z.number().int().nullable(),
      weekly_target: z.number().int().nullable(),
    })
    .nullable(),
  /**
   * アシスト（訳・単語の意味）を一度も使わなかった挑戦だけの正答率
   */
  no_assist: accuracySchema,
  /**
   * 直近 5 件（新しい順）
   */
  recent_attempts: z.array(learningRecordAttemptSchema),
  streak: z.object({
    current: z.number().int(),
    longest: z.number().int(),
    /**
     * 直近 14 日（今日が末尾）
     */
    recent_days: z.array(z.object({ date: z.string(), has_studied: z.boolean() })),
  }),
  today: z.string(),
  totals: accuracySchema.extend({
    attempt_count: z.number().int(),
    /**
     * 解いた問題の数（重複なし）
     */
    passage_count: z.number().int(),
    study_seconds: z.number().int(),
  }),
  /**
   * 設問の種類ごとの正答率（QUESTION_TYPES の順。設問の無い種類も含める）
   */
  type_accuracy: z.array(accuracySchema.extend({ type: z.enum(QUESTION_TYPES) })),
  /**
   * 正答率が一番低い種類（設問のある種類だけで比べる。設問のある種類が 2 つ未満・すべて同率〈すべて 100% を含む〉なら null）
   */
  weakest_question_type: z.enum(QUESTION_TYPES).nullable(),
})

export type GetUserStatsResponse = z.infer<typeof getUserStatsResponseSchema>

// ========================================================
// GET /api/user/calendar - 学習カレンダー
// ========================================================

/**
 * 学習カレンダーのクエリ文字列スキーマ。from / to は両方指定するか両方省略する（省略すると年表示の範囲）。
 * 期間は最大 366 日。両方の指定・from <= to・日数の上限は service で検証する
 */
export const getUserCalendarQueryStringSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
})

export type GetUserCalendarQueryString = z.infer<typeof getUserCalendarQueryStringSchema>

/**
 * 学習カレンダーのレスポンススキーマ
 */
export const getUserCalendarResponseSchema = z.object({
  /**
   * from〜to の全日（日付の昇順。学習していない日も level 0 で含める）
   */
  days: z.array(
    z.object({
      attempt_count: z.number().int(),
      correct_count: z.number().int(),
      date: z.string(),
      /**
       * 色の段階（0 = 学習なし / 1 = 〜5 分 / 2 = 〜15 分 / 3 = 〜30 分 / 4 = 30 分超）
       */
      level: z.number().int().min(0).max(4),
      question_count: z.number().int(),
      study_seconds: z.number().int(),
    }),
  ),
  from: z.string(),
  to: z.string(),
  today: z.string(),
})

export type GetUserCalendarResponse = z.infer<typeof getUserCalendarResponseSchema>

// ========================================================
// GET /api/user/attempts - 提出した挑戦の一覧
// ========================================================

/**
 * 提出した挑戦の一覧のクエリ文字列スキーマ。並び順は提出日時の新しい順（同時刻は id の降順）
 */
export const getUserAttemptsQueryStringSchema = z.object({
  /**
   * 前のページの next_cursor（最後に返した挑戦の id）
   */
  cursor: z.coerce.number().int().positive().optional(),
  /**
   * 指定するとその日（学習した日）の挑戦だけ
   */
  date: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type GetUserAttemptsQueryString = z.infer<typeof getUserAttemptsQueryStringSchema>

/**
 * 提出した挑戦の一覧のレスポンススキーマ。続きが無ければ next_cursor は null
 */
export const getUserAttemptsResponseSchema = z.object({
  attempts: z.array(learningRecordAttemptSchema),
  next_cursor: z.number().int().nullable(),
})

export type GetUserAttemptsResponse = z.infer<typeof getUserAttemptsResponseSchema>
