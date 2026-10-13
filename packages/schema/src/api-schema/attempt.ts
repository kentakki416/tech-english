import { z } from "zod"

import { PASSAGE_BLOCK_TYPES, PASSAGE_SEGMENT_KINDS, QUESTION_TYPES } from "@repo/domain"

import { passageAttributionSchema, passageDifficultySchema } from "./passage"

// ========================================================
// 共通: 挑戦の部品
// ========================================================

/**
 * 本文のセグメント（単語・空白・記号・インラインコード）。code の text はバッククォートを除いた中身。
 * glossary_entry_id は用語集の語句（熟語も 1 つのセグメント）のときだけ付く
 */
export const passageSegmentSchema = z.object({
  glossary_entry_id: z.number().int().optional(),
  kind: z.enum(PASSAGE_SEGMENT_KINDS),
  text: z.string(),
})

/**
 * 本文の 1 ブロック。paragraph_number は heading と code が null、それ以外は 1 から（設問の "paragraph 1" と対応する）
 */
export const attemptBlockSchema = z.object({
  /**
   * code のブロックだけ。シンタックスハイライトの言語
   */
  lang: z.string().nullable(),
  paragraph_number: z.number().int().nullable(),
  /**
   * code のブロックは空
   */
  segments: z.array(passageSegmentSchema),
  /**
   * 元の本文（インラインコードはバッククォートで囲んだまま）
   */
  text: z.string(),
  /**
   * code のブロックは null
   */
  translation_ja: z.string().nullable(),
  type: z.enum(PASSAGE_BLOCK_TYPES),
})

/**
 * 用語集の項目（この文脈での意味）。本文中の位置はセグメントの glossary_entry_id で示す
 */
export const attemptGlossaryEntrySchema = z.object({
  id: z.number().int(),
  lemma: z.string(),
  meaning_ja: z.string(),
  note_ja: z.string().nullable(),
  part_of_speech: z.string().nullable(),
  surface: z.string(),
})

/**
 * 解答中の設問。正解・解説・根拠を持たない
 */
export const attemptQuestionSchema = z.object({
  id: z.number().int(),
  choices: z.array(z.string()).length(4),
  order_index: z.number().int(),
  prompt: z.string(),
  type: z.enum(QUESTION_TYPES),
})

/**
 * 挑戦した問題の概要
 */
export const attemptPassageSchema = z.object({
  id: z.number().int(),
  difficulty: passageDifficultySchema,
  title: z.string(),
  word_count: z.number().int(),
})

/**
 * 解答中の挑戦。本文（セグメント・和訳）・用語集（語義設問の対象語句を除く）・設問（正解なし）・出典を含む。
 * expires_at は開始の 24 時間後、server_now はクライアントが端末時計とのずれを補正するためのサーバーの現在時刻、
 * time_limit_seconds は開始時点の制限時間
 */
export const inProgressAttemptSchema = z.object({
  id: z.number().int(),
  attribution: passageAttributionSchema,
  blocks: z.array(attemptBlockSchema),
  expires_at: z.string(),
  glossary: z.array(attemptGlossaryEntrySchema),
  passage: attemptPassageSchema,
  questions: z.array(attemptQuestionSchema),
  server_now: z.string(),
  started_at: z.string(),
  status: z.literal("in_progress"),
  time_limit_seconds: z.number().int(),
})

/**
 * 期限切れ（開始から 24 時間たって提出されなかった）の挑戦
 */
export const expiredAttemptSchema = z.object({
  id: z.number().int(),
  passage: attemptPassageSchema,
  started_at: z.string(),
  status: z.literal("expired"),
})

export type PassageSegmentResponse = z.infer<typeof passageSegmentSchema>
export type AttemptBlock = z.infer<typeof attemptBlockSchema>
export type AttemptGlossaryEntry = z.infer<typeof attemptGlossaryEntrySchema>
export type AttemptQuestion = z.infer<typeof attemptQuestionSchema>
export type AttemptPassage = z.infer<typeof attemptPassageSchema>
export type InProgressAttempt = z.infer<typeof inProgressAttemptSchema>
export type ExpiredAttempt = z.infer<typeof expiredAttemptSchema>

// ========================================================
// POST /api/passage/:id/attempt - 挑戦の開始
// ========================================================

/**
 * 挑戦の開始のパスパラメータスキーマ（問題の ID）
 */
export const startAttemptPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 挑戦の開始のレスポンススキーマ。新しく始めたら 201、期限内の挑戦中を再開したら 200 で同じ形を返す
 */
export const startAttemptResponseSchema = inProgressAttemptSchema

export type StartAttemptPathParam = z.infer<typeof startAttemptPathParamSchema>
export type StartAttemptResponse = z.infer<typeof startAttemptResponseSchema>

// ========================================================
// GET /api/attempt/:id - 自分の挑戦の取得
// ========================================================

/**
 * 挑戦の取得のパスパラメータスキーマ（挑戦の ID）
 */
export const getAttemptPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 挑戦の取得のレスポンススキーマ。status で形が変わる（in_progress は開始時と同じ形、expired は概要だけ。
 * submitted の結果の形は提出 API と合わせて足す）
 */
export const getAttemptResponseSchema = z.discriminatedUnion("status", [inProgressAttemptSchema, expiredAttemptSchema])

export type GetAttemptPathParam = z.infer<typeof getAttemptPathParamSchema>
export type GetAttemptResponse = z.infer<typeof getAttemptResponseSchema>
