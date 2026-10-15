import { z } from "zod"

import { MAX_SERIAL_ID } from "@repo/domain"

// ========================================================
// 共通: エラーレスポンス
// ========================================================

/**
 * エラーの詳細の 1 項目（`@repo/errors` の ApiErrorDetail と同じ形）
 * `{ code: "evidence_not_found", message: "...", path: ["questions", 1, "evidence"] }`
 */
export const errorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.array(z.union([z.number(), z.string()])),
})

/**
 * エラーレスポンススキーマ（全エンドポイント共通）
 * `{ error: "...", status_code: 400 }`。原因の詳細を返すエンドポイント（admin の問題の公開など）だけ `details` を付ける
 */
export const errorResponseSchema = z.object({
  details: z.array(errorDetailSchema).optional(),
  error: z.string(),
  status_code: z.number(),
})

export type ErrorDetail = z.infer<typeof errorDetailSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>

// ========================================================
// 共通: 成功メッセージレスポンス
// ========================================================

/**
 * メッセージのみを返す成功レスポンススキーマ（DELETE 系などで使用）
 */
export const messageResponseSchema = z.object({
  message: z.string(),
})

export type MessageResponse = z.infer<typeof messageResponseSchema>

// ========================================================
// 共通: カーソルベースページネーション
// ========================================================

/**
 * カーソルベースページネーションのクエリ文字列スキーマ
 * `?cursor=10&limit=20`
 */
export const cursorPaginationQueryStringSchema = z.object({
  cursor: z.coerce.number().int().positive().max(MAX_SERIAL_ID).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type CursorPaginationQueryString = z.infer<typeof cursorPaginationQueryStringSchema>

/**
 * カーソルベースページネーションのレスポンスメタ部
 * 個別エンドポイントでは `data` を該当配列スキーマに置き換えて利用する
 */
export const cursorPaginationMetaSchema = z.object({
  has_more: z.boolean(),
  next_cursor: z.number().nullable(),
})

export type CursorPaginationMeta = z.infer<typeof cursorPaginationMetaSchema>

/**
 * カーソルベースページネーションのレスポンスを生成するヘルパー
 *
 * @example
 * const getStreamListResponseSchema = paginatedResponseSchema(streamSchema)
 */
export const paginatedResponseSchema = <ItemSchema extends z.ZodTypeAny>(itemSchema: ItemSchema) =>
  z.object({
    data: z.array(itemSchema),
    has_more: z.boolean(),
    next_cursor: z.number().nullable(),
  })
