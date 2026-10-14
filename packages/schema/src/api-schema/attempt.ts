import { z } from "zod"

import {
  MAX_QUESTIONS_PER_PASSAGE,
  PASSAGE_BLOCK_TYPES,
  PASSAGE_SEGMENT_KINDS,
  QUESTION_CHOICE_COUNT,
  QUESTION_TYPES,
  WORD_LOOKUP_SOURCES,
} from "@repo/domain"

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

/**
 * 結果の設問。解答中の設問に、正解・解説・根拠と自分の回答・正誤を足したもの。
 * 正解・解説・選択肢はいまの設問、selected_choice_index と is_correct は提出時に保存した値
 */
export const resultQuestionSchema = attemptQuestionSchema.extend({
  correct_choice_index: z.number().int(),
  /**
   * 根拠のブロック（block_index）のセグメントの範囲（segment_end は含まない）。引用が本文に見つからなければ null
   */
  evidence: z
    .object({
      block_index: z.number().int(),
      quote: z.string(),
      segment_end: z.number().int(),
      segment_start: z.number().int(),
    })
    .nullable(),
  explanation_ja: z.string(),
  /**
   * 提出時点の正誤（保存値。後から正解が直されても変わらない）
   */
  is_correct: z.boolean(),
  /**
   * null は未回答
   */
  selected_choice_index: z.number().int().nullable(),
})

/**
 * 結果の「調べた単語」の 1 件。meaning_ja は用語集の文脈での意味か辞書の意味（用語集が消された・辞書に無いものは null）
 */
export const resultWordLookupSchema = z.object({
  lemma: z.string(),
  meaning_ja: z.string().nullable(),
  source: z.enum(WORD_LOOKUP_SOURCES),
  surface: z.string(),
})

/**
 * 提出済みの挑戦（結果の形）。本文・用語集は語義設問の対象語句も含む（結果画面では用語集の意味も見せる）
 */
export const submittedAttemptSchema = z.object({
  id: z.number().int(),
  attribution: passageAttributionSchema,
  /**
   * 語義設問の対象語句も含む用語集で分割する
   */
  blocks: z.array(attemptBlockSchema),
  correct_count: z.number().int(),
  /**
   * 画面を見ていた秒数を、提出時刻 − 開始時刻で切り詰めた値
   */
  elapsed_seconds: z.number().int(),
  glossary: z.array(attemptGlossaryEntrySchema),
  is_overtime: z.boolean(),
  /**
   * 解答中に読み上げを聞いた段落の数（結果画面の「読み上げ n 段落」）
   */
  listened_block_count: z.number().int(),
  passage: attemptPassageSchema,
  question_count: z.number().int(),
  questions: z.array(resultQuestionSchema),
  started_at: z.string(),
  status: z.literal("submitted"),
  /**
   * 提出時のユーザーのタイムゾーンでの日付（YYYY-MM-DD）
   */
  study_date: z.string(),
  submitted_at: z.string(),
  /**
   * 開始時点の制限時間
   */
  time_limit_seconds: z.number().int(),
  translated_block_count: z.number().int(),
  word_lookup_count: z.number().int(),
  /**
   * 結果画面の「調べた単語」。(source, 用語集の ID か見出し語) で重複を除き、最初に調べた順
   */
  word_lookups: z.array(resultWordLookupSchema),
  /**
   * 英単語数 ÷ かかった分（四捨五入）。elapsed_seconds が 0 なら null（web / mobile で同じ値にするため api で計算する）
   */
  words_per_minute: z.number().int().nullable(),
})

export type PassageSegmentResponse = z.infer<typeof passageSegmentSchema>
export type AttemptBlock = z.infer<typeof attemptBlockSchema>
export type AttemptGlossaryEntry = z.infer<typeof attemptGlossaryEntrySchema>
export type AttemptQuestion = z.infer<typeof attemptQuestionSchema>
export type AttemptPassage = z.infer<typeof attemptPassageSchema>
export type InProgressAttempt = z.infer<typeof inProgressAttemptSchema>
export type ExpiredAttempt = z.infer<typeof expiredAttemptSchema>
export type ResultQuestion = z.infer<typeof resultQuestionSchema>
export type ResultWordLookup = z.infer<typeof resultWordLookupSchema>
export type SubmittedAttempt = z.infer<typeof submittedAttemptSchema>

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
 * 挑戦の取得のレスポンススキーマ。status で形が変わる（in_progress は開始時と同じ形、submitted は提出 API と同じ結果の形、
 * expired は概要だけ）
 */
export const getAttemptResponseSchema = z.discriminatedUnion("status", [
  inProgressAttemptSchema,
  submittedAttemptSchema,
  expiredAttemptSchema,
])

export type GetAttemptPathParam = z.infer<typeof getAttemptPathParamSchema>
export type GetAttemptResponse = z.infer<typeof getAttemptResponseSchema>

// ========================================================
// POST /api/attempt/:id/submit - 提出
// ========================================================

/**
 * 提出のパスパラメータスキーマ（挑戦の ID）
 */
export const submitAttemptPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 提出で受け取る調べた単語の件数の上限。web / mobile はこの件数を超えた分を記録しない
 */
export const SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS = 300

/**
 * 提出で受け取る調べた単語の surface / lemma の長さの上限（前後の空白を除いた文字数）。web / mobile はこれを超える記録を送らない
 */
export const SUBMIT_ATTEMPT_MAX_WORD_LENGTH = 100

/**
 * 提出のリクエストスキーマ。answers に無い設問は未回答として採点する。answers の上限は 1 つの問題の設問数の上限
 */
export const submitAttemptRequestSchema = z.object({
  /**
   * 画面を見ていた秒数（クライアントの計測値）。サーバーが提出時刻 − 開始時刻で切り詰める
   */
  active_seconds: z.number().int().nonnegative(),
  answers: z
    .array(
      z.object({
        question_id: z.number().int().positive(),
        /**
         * null は未回答
         */
        selected_choice_index: z.number().int().min(0).max(QUESTION_CHOICE_COUNT - 1).nullable(),
      }),
    )
    .max(MAX_QUESTIONS_PER_PASSAGE),
  /**
   * 読み上げを 1 秒以上聞いた段落の数。サーバーが code 以外のブロック数で上限をかける。
   * 古いアプリ（送ってこない版）のために省略時は 0
   */
  listened_block_count: z.number().int().nonnegative().default(0),
  /**
   * 和訳を一度でも見た段落の数。サーバーが code 以外のブロック数で上限をかける
   */
  translated_block_count: z.number().int().nonnegative(),
  /**
   * 調べた 1 回ごとに 1 要素（同じ単語を 2 回調べたら 2 要素）。glossary_entry_id は source が glossary のときだけ持つ
   */
  word_lookups: z
    .array(
      z
        .object({
          glossary_entry_id: z.number().int().positive().nullable(),
          lemma: z.string().trim().min(1).max(SUBMIT_ATTEMPT_MAX_WORD_LENGTH),
          source: z.enum(WORD_LOOKUP_SOURCES),
          surface: z.string().trim().min(1).max(SUBMIT_ATTEMPT_MAX_WORD_LENGTH),
        })
        .refine((lookup) => (lookup.source === "glossary") === (lookup.glossary_entry_id !== null), {
          message: "glossary_entry_id is required only when source is glossary",
          path: ["glossary_entry_id"],
        }),
    )
    .max(SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS),
})

/**
 * 提出のレスポンススキーマ。すでに提出済みなら保存済みの結果を同じ形で返す（冪等）
 */
export const submitAttemptResponseSchema = submittedAttemptSchema

export type SubmitAttemptPathParam = z.infer<typeof submitAttemptPathParamSchema>
/**
 * クライアントが送る形（listened_block_count は省略できる）なので入力の型にする。api は parseRequest で既定値を埋めた出力の型を受け取る
 */
export type SubmitAttemptRequest = z.input<typeof submitAttemptRequestSchema>
export type SubmitAttemptResponse = z.infer<typeof submitAttemptResponseSchema>

// ========================================================
// GET /api/attempt/:id/audio - 挑戦の問題の読み上げの音声
// ========================================================

/**
 * 挑戦の音声のパスパラメータスキーマ（挑戦の ID）
 */
export const getAttemptAudioPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 単語 1 つの時刻と位置 [start_ms, end_ms, start_offset, end_offset]。
 * offset は blocks[block_index].text（バッククォートを含む元の本文）上の UTF-16 の index で、end_offset は含まない
 */
const audioWordTimingSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

/**
 * 挑戦の音声のレスポンススキーマ。status で形が変わる。
 * pending は準備中（生成待ち・生成中・公開し直された後の確認待ちを含む）、failed は生成に失敗した（管理者が再試行するまで作り直さない）、
 * ready は読み上げるブロック（code を除く）ごとのパート（ふつう 1 ブロック 1 パート）の URL・長さ・単語の時刻
 */
export const getAttemptAudioResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("failed") }),
  z.object({
    blocks: z.array(
      z.object({
        block_index: z.number().int(),
        parts: z.array(
          z.object({
            duration_ms: z.number(),
            url: z.string(),
            words: z.array(audioWordTimingSchema),
          }),
        ),
      }),
    ),
    status: z.literal("ready"),
  }),
])

export type GetAttemptAudioPathParam = z.infer<typeof getAttemptAudioPathParamSchema>
export type GetAttemptAudioResponse = z.infer<typeof getAttemptAudioResponseSchema>
