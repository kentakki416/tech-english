import { z } from "zod"

import { PASSAGE_DIFFICULTIES, SOURCE_KINDS } from "@repo/domain"

// ========================================================
// 共通: 問題の部品
// ========================================================

const PASSAGE_DIFFICULTY_VALUES: readonly number[] = PASSAGE_DIFFICULTIES

/**
 * 難易度（1〜3）。出力の型を 1 | 2 | 3 に絞る
 */
export const passageDifficultySchema = z
  .number()
  .int()
  .refine((value): value is (typeof PASSAGE_DIFFICULTIES)[number] => PASSAGE_DIFFICULTY_VALUES.includes(value), {
    message: "Invalid difficulty",
  })

/**
 * カンマ区切りのクエリ（`difficulty=1,3` / `tag=react,rust`）を配列にする。空の要素は捨てる
 */
const commaSeparatedSchema = z
  .string()
  .max(500)
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : []))

/**
 * 難易度の絞り込み（カンマ区切り。どれかに当てはまる）
 */
const difficultyFilterSchema = commaSeparatedSchema.pipe(z.array(z.coerce.number().pipe(passageDifficultySchema)))

/**
 * 出典表示（content-collection の「出典表示」）。attempt.ts からも使う
 */
export const passageAttributionSchema = z.object({
  /**
   * 取得時のコミット。サイトは null
   */
  commit_sha: z.string().nullable(),
  license_spdx: z.string(),
  license_url: z.string(),
  /**
   * 公開ページの URL（無ければ GitHub のファイル）/ サイトのページ
   */
  page_url: z.string(),
  /**
   * GitHub のコミットに固定したリンク。サイトとコミットが無いものは null
   */
  permalink_url: z.string().nullable(),
  retrieved_at: z.string(),
  source_kind: z.enum(SOURCE_KINDS),
  source_name: z.string(),
})

export type PassageAttributionResponse = z.infer<typeof passageAttributionSchema>

/**
 * 問題一覧の 1 行
 */
export const passageListItemSchema = z.object({
  id: z.number().int(),
  difficulty: passageDifficultySchema,
  /**
   * 自分の挑戦状況。attempt_count は提出済みの挑戦の数、best_correct_count はその最高正答数（未提出なら null）、
   * in_progress_attempt_id は期限内の挑戦中の ID
   */
  my_status: z.object({
    attempt_count: z.number().int(),
    best_correct_count: z.number().int().nullable(),
    in_progress_attempt_id: z.number().int().nullable(),
  }),
  question_count: z.number().int(),
  source: z.object({
    kind: z.enum(SOURCE_KINDS),
    name: z.string(),
    tags: z.array(z.string()),
  }),
  time_limit_seconds: z.number().int(),
  title: z.string(),
  word_count: z.number().int(),
})

export type PassageListItemResponse = z.infer<typeof passageListItemSchema>

// ========================================================
// GET /api/passage - 問題一覧
// ========================================================

/**
 * 問題一覧のクエリ文字列スキーマ。並び順は公開日時の新しい順（同時刻は id の降順）。
 * tag / difficulty はカンマ区切りで、どれかに当てはまるもの（OR）。unattempted_only は提出済みの挑戦が 0 件の問題だけ
 */
export const getPassageListQueryStringSchema = z.object({
  /**
   * 前のページの next_cursor（不透明な文字列）
   */
  cursor: z.string().max(200).optional(),
  difficulty: difficultyFilterSchema,
  kind: z.enum(SOURCE_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  tag: commaSeparatedSchema,
  unattempted_only: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
})

/**
 * 問題一覧のレスポンススキーマ。tags は公開中の問題があるソースのタグ全件（絞り込みのチップに使う）、
 * total_count は絞り込み後の件数（cursor は無視）
 */
export const getPassageListResponseSchema = z.object({
  next_cursor: z.string().nullable(),
  passages: z.array(passageListItemSchema),
  tags: z.array(z.string()),
  total_count: z.number().int(),
})

export type GetPassageListQueryString = z.infer<typeof getPassageListQueryStringSchema>
export type GetPassageListResponse = z.infer<typeof getPassageListResponseSchema>

// ========================================================
// GET /api/passage/random - ランダムに 1 問
// ========================================================

/**
 * ランダムに 1 問のクエリ文字列スキーマ（一覧と同じ絞り込み）。未挑戦の問題から選び、無ければ挑戦済みから選ぶ
 */
export const getRandomPassageQueryStringSchema = z.object({
  difficulty: difficultyFilterSchema,
  kind: z.enum(SOURCE_KINDS).optional(),
  tag: commaSeparatedSchema,
})

/**
 * ランダムに 1 問のレスポンススキーマ
 */
export const getRandomPassageResponseSchema = z.object({
  id: z.number().int(),
})

export type GetRandomPassageQueryString = z.infer<typeof getRandomPassageQueryStringSchema>
export type GetRandomPassageResponse = z.infer<typeof getRandomPassageResponseSchema>

// ========================================================
// GET /api/passage/:id - 開始確認の概要
// ========================================================

/**
 * 開始確認の概要のパスパラメータスキーマ
 */
export const getPassagePathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 開始確認の概要のレスポンススキーマ（本文は含まない）。in_progress_attempt は期限内の挑戦中（無ければ null）、
 * server_now はクライアントが端末時計とのずれを補正するためのサーバーの現在時刻
 */
export const getPassageResponseSchema = z.object({
  id: z.number().int(),
  attribution: passageAttributionSchema,
  difficulty: passageDifficultySchema,
  in_progress_attempt: z
    .object({
      id: z.number().int(),
      expires_at: z.string(),
      started_at: z.string(),
    })
    .nullable(),
  question_count: z.number().int(),
  server_now: z.string(),
  time_limit_seconds: z.number().int(),
  title: z.string(),
  word_count: z.number().int(),
})

export type GetPassagePathParam = z.infer<typeof getPassagePathParamSchema>
export type GetPassageResponse = z.infer<typeof getPassageResponseSchema>
