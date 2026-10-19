import { z } from "zod"

import { ADMIN_PASSAGE_STATS_SORTS, ADMIN_STATS_PERIODS, MAX_SERIAL_ID, PASSAGE_STATUSES, QUESTION_TYPES } from "@repo/domain"

import { passageDifficultySchema } from "../passage"

// ========================================================
// 共通: ダッシュボードの数字の部品
// ========================================================

/**
 * 比率（0〜1）。分母が 0 なら null
 */
const rateSchema = z.number().min(0).max(1).nullable()

/**
 * アシストの利用率（解いたうち、和訳を開いた・設問の和訳を出した・単語を調べた・読み上げを聞いた割合）
 */
const assistRatesSchema = z.object({
  listened: rateSchema,
  looked_up: rateSchema,
  translated: rateSchema,
  translated_question: rateSchema,
})

/**
 * 期間（直近 7 日・直近 30 日・全期間）
 */
export const adminStatsPeriodSchema = z.enum(ADMIN_STATS_PERIODS)

/**
 * admin は @repo/domain を import できないので、domain の AdminStatsPeriod と同じ集合の型をここからも出す（AdminPassageStatsSort も同じ）
 */
export type AdminStatsPeriod = z.infer<typeof adminStatsPeriodSchema>

/**
 * 問題ごとの成績の並べ替えの列
 */
export const adminPassageStatsSortSchema = z.enum(ADMIN_PASSAGE_STATS_SORTS)

export type AdminPassageStatsSort = z.infer<typeof adminPassageStatsSortSchema>

/**
 * 問題ごとの成績の 1 行（問題の分析の上部にも使う）
 */
export const adminPassageStatsRowSchema = z.object({
  id: z.number().int(),
  assist_rates: assistRatesSchema,
  average_elapsed_seconds: z.number().nullable(),
  correct_rate: rateSchema,
  difficulty: passageDifficultySchema.nullable(),
  overtime_rate: rateSchema,
  /**
   * 公開日時（ISO 8601）。公開したことが無ければ null
   */
  published_at: z.string().nullable(),
  solved_attempts: z.number().int(),
  solved_users: z.number().int(),
  source: z.object({ id: z.number().int(), name: z.string() }),
  status: z.enum(PASSAGE_STATUSES),
  time_limit_seconds: z.number().int().nullable(),
  title: z.string(),
})

export type AdminPassageStatsRowResponse = z.infer<typeof adminPassageStatsRowSchema>

// ========================================================
// GET /api/admin/stats/overview - 全体の利用状況
// ========================================================

/**
 * 全体の利用状況のクエリ文字列スキーマ
 */
export const getAdminStatsOverviewQueryStringSchema = z.object({
  period: adminStatsPeriodSchema.default("30d"),
})

/**
 * 全体の利用状況のレスポンススキーマ。比率は 0〜1 で、分母が 0 なら null
 */
export const getAdminStatsOverviewResponseSchema = z.object({
  active_users: z.number().int(),
  assist_rates: assistRatesSchema,
  correct_rate: rateSchema,
  /**
   * 期間の始まりと終わり（日本時間の YYYY-MM-DD）。全期間の from は最初のユーザーの登録日（ユーザーがいなければ今日）
   */
  from: z.string(),
  new_users: z.number().int(),
  period: adminStatsPeriodSchema,
  /**
   * 推移。7d / 30d は日ごと、all は週ごと（日本時間の月曜始まり。date はその週の月曜）
   */
  series: z.object({
    bucket: z.enum(["day", "week"]),
    points: z.array(z.object({
      active_users: z.number().int(),
      date: z.string(),
      new_users: z.number().int(),
      solved_attempts: z.number().int(),
    })),
  }),
  solved_attempts: z.number().int(),
  solved_users: z.number().int(),
  to: z.string(),
  /**
   * 今の登録ユーザーの総数（期間に関係しない）
   */
  total_users: z.number().int(),
})

export type GetAdminStatsOverviewQueryString = z.infer<typeof getAdminStatsOverviewQueryStringSchema>
export type GetAdminStatsOverviewResponse = z.infer<typeof getAdminStatsOverviewResponseSchema>

// ========================================================
// GET /api/admin/stats/passage - 問題ごとの成績
// ========================================================

/**
 * 問題ごとの成績のクエリ文字列スキーマ。page は 1 始まり（大きすぎる値で OFFSET があふれないよう上限を置く）
 */
export const getAdminPassageStatsListQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  period: adminStatsPeriodSchema.default("30d"),
  /**
   * タイトルの部分一致
   */
  q: z.string().trim().min(1).max(200).optional(),
  sort: adminPassageStatsSortSchema.default("solved_users"),
})

/**
 * 問題ごとの成績のレスポンススキーマ。total は絞り込んだ全体の件数
 */
export const getAdminPassageStatsListResponseSchema = z.object({
  limit: z.number().int(),
  page: z.number().int(),
  passages: z.array(adminPassageStatsRowSchema),
  total: z.number().int(),
})

export type GetAdminPassageStatsListQueryString = z.infer<typeof getAdminPassageStatsListQueryStringSchema>
export type GetAdminPassageStatsListResponse = z.infer<typeof getAdminPassageStatsListResponseSchema>

// ========================================================
// GET /api/admin/stats/passage/:id - 問題の分析
// ========================================================

/**
 * 問題の分析のパスパラメータスキーマ
 */
export const getAdminPassageStatsPathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

/**
 * 問題の分析のクエリ文字列スキーマ
 */
export const getAdminPassageStatsQueryStringSchema = z.object({
  period: adminStatsPeriodSchema.default("30d"),
})

/**
 * 問題の分析のレスポンススキーマ。期間内に解かれていない問題も 200 で返す（数は 0、比率は null）
 */
export const getAdminPassageStatsResponseSchema = z.object({
  passage: adminPassageStatsRowSchema,
  period: adminStatsPeriodSchema,
  questions: z.array(z.object({
    id: z.number().int(),
    /**
     * 期間内の提出済みの挑戦での、この設問の解答の数（未回答を含む）
     */
    answer_count: z.number().int(),
    /**
     * 選択肢ごとの選ばれた割合（choices と同じ順。分母は answer_count で、未回答も含む）
     */
    choice_rates: z.array(rateSchema),
    choices: z.array(z.string()),
    correct_choice_index: z.number().int(),
    correct_rate: rateSchema,
    /**
     * 正解でないのに、正解と同じかそれ以上選ばれた選択肢の番号（選択肢の順。画面で橙にする）。解答が ADMIN_QUESTION_REVIEW_MIN_ANSWERS 件より少なければ空
     */
    misleading_choice_indexes: z.array(z.number().int()),
    /**
     * 要確認（misleading_choice_indexes が空でない）
     */
    needs_review: z.boolean(),
    order_index: z.number().int(),
    prompt: z.string(),
    type: z.enum(QUESTION_TYPES),
    unanswered_rate: rateSchema,
  })),
})

export type GetAdminPassageStatsPathParam = z.infer<typeof getAdminPassageStatsPathParamSchema>
export type GetAdminPassageStatsQueryString = z.infer<typeof getAdminPassageStatsQueryStringSchema>
export type GetAdminPassageStatsResponse = z.infer<typeof getAdminPassageStatsResponseSchema>
