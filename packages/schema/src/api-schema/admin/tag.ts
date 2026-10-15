import { z } from "zod"

import { MAX_SERIAL_ID, TAG_COLORS } from "@repo/domain"

// ========================================================
// 共通: タグの入力・出力の部品
// ========================================================

/**
 * タグの色のスキーマ。admin の色の選択肢は tagColorSchema.options から作る
 */
export const tagColorSchema = z.enum(TAG_COLORS)

/**
 * タグの名前のスキーマ。前後の空白を除いて 1〜30 文字。
 * カンマはユーザーの問題一覧の URL がタグをカンマ区切りで持つ（?tag=react,rust）ので使えない
 */
export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .refine((value) => !value.includes(","), { message: "Tag name must not contain a comma" })

/**
 * 1 つのタグのレスポンス（ソースのレスポンスの tags にも使う）
 */
export const tagSchema = z.object({
  id: z.number().int(),
  color: tagColorSchema,
  name: z.string(),
})

export type TagResponse = z.infer<typeof tagSchema>

// ========================================================
// GET /api/admin/tag - タグの一覧
// ========================================================

/**
 * タグの一覧のレスポンススキーマ。名前の順（大文字・小文字を区別しない）
 */
export const getTagListResponseSchema = z.object({
  tags: z.array(
    tagSchema.extend({
      source_count: z.number().int(),
    }),
  ),
})

export type GetTagListResponse = z.infer<typeof getTagListResponseSchema>

// ========================================================
// POST /api/admin/tag - タグの作成
// ========================================================

/**
 * タグの作成のリクエストスキーマ。color を省くと api が自動で割り当てる
 */
export const createTagRequestSchema = z.object({
  color: tagColorSchema.optional(),
  name: tagNameSchema,
})

/**
 * タグの作成のレスポンススキーマ
 */
export const createTagResponseSchema = tagSchema

export type CreateTagRequest = z.infer<typeof createTagRequestSchema>
export type CreateTagResponse = z.infer<typeof createTagResponseSchema>

// ========================================================
// PUT /api/admin/tag/:id - タグの名前と色の変更
// ========================================================

/**
 * タグの更新のパスパラメータスキーマ
 */
export const updateTagPathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

/**
 * タグの更新のリクエストスキーマ。名前と色の両方を送る
 */
export const updateTagRequestSchema = z.object({
  color: tagColorSchema,
  name: tagNameSchema,
})

/**
 * タグの更新のレスポンススキーマ
 */
export const updateTagResponseSchema = tagSchema

export type UpdateTagPathParam = z.infer<typeof updateTagPathParamSchema>
export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>
export type UpdateTagResponse = z.infer<typeof updateTagResponseSchema>

// ========================================================
// DELETE /api/admin/tag/:id - タグの削除
// ========================================================

/**
 * タグの削除のパスパラメータスキーマ。成功は 204（ボディなし）なのでレスポンススキーマは無い
 */
export const deleteTagPathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

export type DeleteTagPathParam = z.infer<typeof deleteTagPathParamSchema>
