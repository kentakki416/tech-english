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
 * ユーザー一覧の並べ替えの列
 */
export const adminUserSortSchema = z.enum(ADMIN_USER_SORTS)

export type AdminUserSort = z.infer<typeof adminUserSortSchema>

// ========================================================
// GET /api/admin/user - ユーザー一覧
// ========================================================

export const getAdminUserListQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  /**
   * 名前・メールアドレスの部分一致
   */
  q: z.string().trim().min(1).max(200).optional(),
  sort: adminUserSortSchema.default("created_at"),
})

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

export const getAdminUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

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

export const getAdminUserCalendarQueryStringSchema = getUserCalendarQueryStringSchema
export const getAdminUserCalendarResponseSchema = getUserCalendarResponseSchema
export const getAdminUserAttemptsQueryStringSchema = getUserAttemptsQueryStringSchema
export const getAdminUserAttemptsResponseSchema = getUserAttemptsResponseSchema

export type GetAdminUserCalendarResponse = z.infer<typeof getAdminUserCalendarResponseSchema>
export type GetAdminUserAttemptsResponse = z.infer<typeof getAdminUserAttemptsResponseSchema>
