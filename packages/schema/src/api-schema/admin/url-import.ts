import { z } from "zod"

import { CHUNK_REJECT_REASONS, URL_IMPORT_CHUNK_STATUSES, URL_IMPORT_ERROR_CODES } from "@repo/domain"

import { adminPassageStatusSchema } from "./passage"
import { sourceLicenseSchema } from "./source"

// ========================================================
// 共通: 取り込むページの URL
// ========================================================

/**
 * 取り込むページの URL。https だけを受け付ける（サイトのソースは https のオリジンで登録しているため）
 */
const urlImportUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .regex(/^https:\/\//i, { message: "Must be an https URL" })

/**
 * 取り込めない理由（400 の details[0].code）。admin が文言を分けるために読む
 */
export const urlImportErrorCodeSchema = z.enum(URL_IMPORT_ERROR_CODES)

export type UrlImportErrorCode = z.infer<typeof urlImportErrorCodeSchema>

// ========================================================
// POST /api/admin/url-import/preview - URL のページの取り込みの確認
// ========================================================

/**
 * URL のページの取り込みの確認のリクエストスキーマ
 */
export const previewUrlImportRequestSchema = z.object({
  url: urlImportUrlSchema,
})

/**
 * URL のページの取り込みの確認のレスポンススキーマ。chunks は切り分けた塊ごとに、保存したときにどうなるか（status）と、同じ内容の本文候補（same_content_passage。状態を問わない）
 */
export const previewUrlImportResponseSchema = z.object({
  chunks: z.array(z.object({
    excerpt: z.string(),
    reject_reasons: z.array(z.enum(CHUNK_REJECT_REASONS)),
    same_content_passage: z.object({
      id: z.number().int().positive(),
      status: adminPassageStatusSchema,
    }).nullable(),
    status: z.enum(URL_IMPORT_CHUNK_STATUSES),
    title: z.string(),
    word_count: z.number().int().nonnegative(),
  })),
  page: z.object({
    path: z.string(),
    title: z.string(),
    url: z.string(),
    word_count: z.number().int().nonnegative(),
  }),
  source: z.object({
    id: z.number().int().positive(),
    license_spdx: sourceLicenseSchema,
    name: z.string(),
  }),
})

export type PreviewUrlImportRequest = z.infer<typeof previewUrlImportRequestSchema>
export type PreviewUrlImportResponse = z.infer<typeof previewUrlImportResponseSchema>

// ========================================================
// POST /api/admin/url-import - URL のページを本文候補として保存
// ========================================================

/**
 * URL のページを本文候補として保存するリクエストスキーマ
 */
export const createUrlImportRequestSchema = z.object({
  url: urlImportUrlSchema,
})

/**
 * URL のページを本文候補として保存するレスポンススキーマ。passages は今回生成を優先した本文候補（is_new は今回作ったもの）
 */
export const createUrlImportResponseSchema = z.object({
  created_count: z.number().int().nonnegative(),
  passages: z.array(z.object({
    id: z.number().int().positive(),
    is_new: z.boolean(),
    title: z.string(),
  })),
  rejected_count: z.number().int().nonnegative(),
  source_document_id: z.number().int().positive(),
  source_id: z.number().int().positive(),
})

export type CreateUrlImportRequest = z.infer<typeof createUrlImportRequestSchema>
export type CreateUrlImportResponse = z.infer<typeof createUrlImportResponseSchema>
