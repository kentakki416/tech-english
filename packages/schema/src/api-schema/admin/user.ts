import { z } from "zod"

import { ADMIN_USER_SORTS } from "@repo/domain"

import {
  getUserAttemptsQueryStringSchema,
  getUserAttemptsResponseSchema,
  getUserCalendarQueryStringSchema,
  getUserCalendarResponseSchema,
  getUserStatsResponseSchema,
} from "../learning-record"
import { getVocabularySummaryResponseSchema } from "../vocabulary"

// ========================================================
// 共通: ユーザーの項目
// ========================================================

const adminUserBaseSchema = z.object({
  id: z.number().int(),
  avatar_url: z.string().nullable(),
  email: z.string().nullable(),
  /**
   * 最後に問題を解いた・単語帳で答えた日（学習したときのユーザーのタイムゾーンの日付）。学習していなければ null
   */
  last_studied_date: z.string().nullable(),
  name: z.string().nullable(),
  /**
   * ログイン方法（auth_accounts.provider。"github" / "google" / "dev" など。名前順・重複なし）
   */
  providers: z.array(z.string()),
  /**
   * 登録日時（ISO 8601）
   */
  created_at: z.string(),
})

/**
 * ユーザー一覧の並べ替えの列（admin は @repo/domain を import できないので、domain の AdminUserSort と同じ集合の型をここからも出す）
 */
export const adminUserSortSchema = z.enum(ADMIN_USER_SORTS)

export type AdminUserSort = z.infer<typeof adminUserSortSchema>

// ========================================================
// GET /api/admin/user - ユーザー一覧
// ========================================================

/**
 * ユーザー一覧のクエリ文字列スキーマ。page は 1 始まり（大きすぎる値で OFFSET があふれないよう上限を置く）
 */
export const getAdminUserListQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /**
   * 名前・メールアドレスの部分一致
   */
  q: z.string().trim().min(1).max(200).optional(),
  sort: adminUserSortSchema.default("created_at"),
})

/**
 * ユーザー一覧のレスポンススキーマ。total は絞り込んだ全体の件数
 */
export const getAdminUserListResponseSchema = z.object({
  limit: z.number().int(),
  page: z.number().int(),
  total: z.number().int(),
  users: z.array(adminUserBaseSchema.extend({
    solved_attempts: z.number().int(),
  })),
})

export type GetAdminUserListQueryString = z.infer<typeof getAdminUserListQueryStringSchema>
export type GetAdminUserListResponse = z.infer<typeof getAdminUserListResponseSchema>

// ========================================================
// GET /api/admin/user/:id - ユーザーの詳細
// ========================================================

/**
 * ユーザーの詳細のパスパラメータスキーマ
 */
export const getAdminUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * ユーザーの詳細のレスポンススキーマ。stats・vocabulary はマイページ（/api/user/stats・/api/vocabulary/summary）と同じ形
 */
export const getAdminUserResponseSchema = z.object({
  stats: getUserStatsResponseSchema,
  user: adminUserBaseSchema.extend({
    timezone: z.string(),
  }),
  vocabulary: getVocabularySummaryResponseSchema,
})

export type GetAdminUserPathParam = z.infer<typeof getAdminUserPathParamSchema>
export type GetAdminUserResponse = z.infer<typeof getAdminUserResponseSchema>

// ========================================================
// GET /api/admin/user/:id/calendar・/attempts - ユーザー向けと同じ形
// ========================================================

/**
 * 学習カレンダーのパスパラメータスキーマ
 */
export const getAdminUserCalendarPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const getAdminUserCalendarQueryStringSchema = getUserCalendarQueryStringSchema
export const getAdminUserCalendarResponseSchema = getUserCalendarResponseSchema

/**
 * 学習履歴のパスパラメータスキーマ
 */
export const getAdminUserAttemptsPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const getAdminUserAttemptsQueryStringSchema = getUserAttemptsQueryStringSchema
export const getAdminUserAttemptsResponseSchema = getUserAttemptsResponseSchema

export type GetAdminUserCalendarResponse = z.infer<typeof getAdminUserCalendarResponseSchema>
export type GetAdminUserAttemptsResponse = z.infer<typeof getAdminUserAttemptsResponseSchema>
