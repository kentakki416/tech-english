import { z } from "zod"

import {
  MAX_QUESTIONS_PER_PASSAGE,
  PASSAGE_BLOCK_TYPES,
  PASSAGE_DIFFICULTIES,
  PASSAGE_STATUSES,
  QUESTION_CHOICE_COUNT,
  QUESTION_TYPES,
} from "@repo/domain"

import { passageCountsSchema } from "./content-source"

// ========================================================
// 共通: 問題の入力・出力の部品
// ========================================================

const PASSAGE_DIFFICULTY_VALUES: readonly number[] = PASSAGE_DIFFICULTIES

/**
 * 難易度（1〜3）。出力の型を 1 | 2 | 3 に絞る
 */
const difficultySchema = z
  .number()
  .int()
  .refine((value): value is (typeof PASSAGE_DIFFICULTIES)[number] => PASSAGE_DIFFICULTY_VALUES.includes(value), {
    message: "Invalid difficulty",
  })

const passageStatusSchema = z.enum(PASSAGE_STATUSES)

/**
 * 一覧と詳細に共通する問題の項目
 */
const adminPassageSummaryBaseSchema = z.object({
  id: z.number().int(),
  /**
   * 挑戦の件数（状態を問わない）
   */
  attempt_count: z.number().int(),
  /**
   * 要確認の理由（例「Q3：検証モデルは A を選択（正解は B）」）
   */
  attention_reasons: z.array(z.string()),
  difficulty: difficultySchema.nullable(),
  generation_error: z.string().nullable(),
  needs_attention: z.boolean(),
  question_count: z.number().int(),
  reject_reason: z.string().nullable(),
  status: passageStatusSchema,
  title: z.string(),
  word_count: z.number().int(),
  updated_at: z.string(),
})

/**
 * 問題一覧の 1 行
 */
export const adminPassageListItemSchema = adminPassageSummaryBaseSchema.extend({
  source: z.object({
    id: z.number().int(),
    name: z.string(),
  }),
})

/**
 * 問題の全情報（詳細・保存のレスポンス）
 */
export const adminPassageDetailSchema = adminPassageSummaryBaseSchema.extend({
  /**
   * 本文。lang は code のみ、translation_ja は code 以外（未入力なら null）
   */
  blocks: z.array(
    z.object({
      lang: z.string().nullable(),
      text: z.string(),
      translation_ja: z.string().nullable(),
      type: z.enum(PASSAGE_BLOCK_TYPES),
    }),
  ),
  generated_at: z.string().nullable(),
  generation_model: z.string().nullable(),
  generation_prompt_version: z.string().nullable(),
  /**
   * 用語集。ブロックの位置 → 文字位置の順。位置は blocks[block_index].text 上の UTF-16 の index で [start_offset, end_offset)
   */
  glossary: z.array(
    z.object({
      id: z.number().int(),
      block_index: z.number().int(),
      end_offset: z.number().int(),
      lemma: z.string(),
      meaning_ja: z.string(),
      note_ja: z.string().nullable(),
      part_of_speech: z.string().nullable(),
      start_offset: z.number().int(),
      surface: z.string(),
    }),
  ),
  published_at: z.string().nullable(),
  /**
   * 設問。order_index の順
   */
  questions: z.array(
    z.object({
      id: z.number().int(),
      choices: z.array(z.string()),
      correct_choice_index: z.number().int(),
      evidence: z.object({
        block_index: z.number().int(),
        quote: z.string(),
      }),
      explanation_ja: z.string(),
      order_index: z.number().int(),
      prompt: z.string(),
      target_glossary_entry_id: z.number().int().nullable(),
      type: z.enum(QUESTION_TYPES),
      /**
       * 解答キーを見ない検証で検証モデルが選んだ選択肢。検証していない設問は null
       */
      verification_choice_index: z.number().int().nullable(),
    }),
  ),
  reviewed_at: z.string().nullable(),
  /**
   * 出典。path / commit_sha / retrieved_at は取得した時点の値（passages に持つ）
   */
  source: z.object({
    id: z.number().int(),
    commit_sha: z.string().nullable(),
    name: z.string(),
    path: z.string(),
    retrieved_at: z.string(),
  }),
  /**
   * 「計算式で再計算」に使う定数（admin は @repo/domain を import できないため API から渡す）。
   * 制限時間（秒） = 英単語数 ÷ WPM × 60 ＋ 設問数 × seconds_per_question を rounding_seconds 単位に切り上げる
   */
  time_limit_formula: z.object({
    rounding_seconds: z.number().int(),
    seconds_per_question: z.number().int(),
    wpm_by_difficulty: z.array(
      z.object({
        difficulty: difficultySchema,
        wpm: z.number().int(),
      }),
    ),
  }),
  time_limit_seconds: z.number().int().nullable(),
})

/**
 * 状態を変える操作（公開・却下・非公開・再生成）のレスポンス
 */
const adminPassageStatusResponseSchema = z.object({
  id: z.number().int(),
  status: passageStatusSchema,
})

export type AdminPassageListItemResponse = z.infer<typeof adminPassageListItemSchema>
export type AdminPassageDetailResponse = z.infer<typeof adminPassageDetailSchema>

// ========================================================
// GET /api/admin/passage - 問題一覧
// ========================================================

/**
 * 問題一覧のクエリ文字列スキーマ。並び順は draft が「要確認 → 更新が古い順」、それ以外は「更新が新しい順」
 */
export const getAdminPassageListQueryStringSchema = z.object({
  /**
   * 前のページの next_cursor（不透明な文字列）
   */
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  needs_attention: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  source_id: z.coerce.number().int().positive().optional(),
  status: passageStatusSchema.default("draft"),
})

/**
 * 問題一覧のレスポンススキーマ。status_counts は絞り込みを無視した全体の状態ごとの件数
 */
export const getAdminPassageListResponseSchema = z.object({
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
  passages: z.array(adminPassageListItemSchema),
  status_counts: passageCountsSchema,
})

export type GetAdminPassageListQueryString = z.infer<typeof getAdminPassageListQueryStringSchema>
export type GetAdminPassageListResponse = z.infer<typeof getAdminPassageListResponseSchema>

// ========================================================
// GET /api/admin/passage/:id - 問題の詳細
// ========================================================

/**
 * 問題の詳細のパスパラメータスキーマ
 */
export const getAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 問題の詳細のレスポンススキーマ
 */
export const getAdminPassageResponseSchema = adminPassageDetailSchema

export type GetAdminPassagePathParam = z.infer<typeof getAdminPassagePathParamSchema>
export type GetAdminPassageResponse = z.infer<typeof getAdminPassageResponseSchema>

// ========================================================
// PUT /api/admin/passage/:id - 下書きの保存
// ========================================================

/**
 * 下書きの保存のパスパラメータスキーマ
 */
export const updateAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 下書きの保存のリクエストスキーマ。途中の状態（空の選択肢・解説・和訳など）も保存でき、正しさは公開の検査で見る。
 *
 * - blocks：英文と和訳だけ。数と種類（type / lang）は変えられない（数が違えば service が 400 にする）。code の和訳は捨てる
 * - glossary：id が null なら新規。文字位置は受け取らず、保存時に新しい英文から求め直す
 * - questions：id が null なら新規。配列の順が order_index になる。target_glossary_index は同じリクエストの glossary の index
 *   （新規の語句を対象にできるように id ではなく index で指す）。vocabulary 以外では無視する
 */
export const updateAdminPassageRequestSchema = z.object({
  blocks: z
    .array(
      z.object({
        text: z
          .string()
          .max(20000)
          .refine((value) => value.trim().length > 0, { message: "Text must not be blank" }),
        translation_ja: z.string().max(20000).nullable(),
      }),
    )
    .min(1),
  difficulty: difficultySchema,
  glossary: z
    .array(
      z.object({
        id: z.number().int().positive().nullable(),
        block_index: z.number().int().nonnegative(),
        lemma: z.string().max(200),
        meaning_ja: z.string().max(1000),
        note_ja: z.string().max(1000).nullable(),
        part_of_speech: z.string().max(50).nullable(),
        surface: z.string().max(200),
      }),
    )
    .max(100),
  questions: z
    .array(
      z.object({
        id: z.number().int().positive().nullable(),
        choices: z.array(z.string().max(1000)).length(QUESTION_CHOICE_COUNT),
        correct_choice_index: z
          .number()
          .int()
          .min(0)
          .max(QUESTION_CHOICE_COUNT - 1),
        evidence: z.object({
          block_index: z.number().int().nonnegative(),
          quote: z.string().max(2000),
        }),
        explanation_ja: z.string().max(5000),
        prompt: z.string().max(1000),
        target_glossary_index: z.number().int().nonnegative().nullable(),
        type: z.enum(QUESTION_TYPES),
      }),
    )
    .min(1)
    .max(MAX_QUESTIONS_PER_PASSAGE),
  time_limit_seconds: z.number().int().positive().max(86400),
  title: z.string().trim().min(1).max(255),
})

/**
 * 下書きの保存のレスポンススキーマ（再計算した用語集の位置を含む）
 */
export const updateAdminPassageResponseSchema = adminPassageDetailSchema

export type UpdateAdminPassagePathParam = z.infer<typeof updateAdminPassagePathParamSchema>
export type UpdateAdminPassageRequest = z.infer<typeof updateAdminPassageRequestSchema>
export type UpdateAdminPassageResponse = z.infer<typeof updateAdminPassageResponseSchema>

// ========================================================
// POST /api/admin/passage/:id/publish - 公開
// ========================================================

/**
 * 公開のパスパラメータスキーマ。公開の条件を満たさなければ 400 で、満たしていない条件を details に返す
 */
export const publishAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 公開のレスポンススキーマ
 */
export const publishAdminPassageResponseSchema = adminPassageStatusResponseSchema

export type PublishAdminPassagePathParam = z.infer<typeof publishAdminPassagePathParamSchema>
export type PublishAdminPassageResponse = z.infer<typeof publishAdminPassageResponseSchema>

// ========================================================
// POST /api/admin/passage/:id/reject - 却下
// ========================================================

/**
 * 却下のパスパラメータスキーマ
 */
export const rejectAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 却下のリクエストスキーマ。理由は必須（前後の空白を除いて 1〜1000 文字）
 */
export const rejectAdminPassageRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
})

/**
 * 却下のレスポンススキーマ
 */
export const rejectAdminPassageResponseSchema = adminPassageStatusResponseSchema

export type RejectAdminPassagePathParam = z.infer<typeof rejectAdminPassagePathParamSchema>
export type RejectAdminPassageRequest = z.infer<typeof rejectAdminPassageRequestSchema>
export type RejectAdminPassageResponse = z.infer<typeof rejectAdminPassageResponseSchema>

// ========================================================
// POST /api/admin/passage/:id/unpublish - 非公開に戻す
// ========================================================

/**
 * 非公開に戻すのパスパラメータスキーマ
 */
export const unpublishAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 非公開に戻すのレスポンススキーマ
 */
export const unpublishAdminPassageResponseSchema = adminPassageStatusResponseSchema

export type UnpublishAdminPassagePathParam = z.infer<typeof unpublishAdminPassagePathParamSchema>
export type UnpublishAdminPassageResponse = z.infer<typeof unpublishAdminPassageResponseSchema>

// ========================================================
// POST /api/admin/passage/:id/regenerate - 再生成
// ========================================================

/**
 * 再生成のパスパラメータスキーマ。生成した内容を消して collected に戻す（挑戦が 1 件でもあれば 409）
 */
export const regenerateAdminPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 再生成のレスポンススキーマ
 */
export const regenerateAdminPassageResponseSchema = adminPassageStatusResponseSchema

export type RegenerateAdminPassagePathParam = z.infer<typeof regenerateAdminPassagePathParamSchema>
export type RegenerateAdminPassageResponse = z.infer<typeof regenerateAdminPassageResponseSchema>
