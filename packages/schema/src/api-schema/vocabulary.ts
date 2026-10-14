import { z } from "zod"

import { WORD_LOOKUP_SOURCES } from "@repo/domain"

// ========================================================
// GET /api/vocabulary/summary - 単語帳のトップの数
// ========================================================

/**
 * 単語帳のトップのレスポンススキーマ。next_due_date は今日より後で一番近い、次に復習のカードが出る日（無ければ null）
 */
export const getVocabularySummaryResponseSchema = z.object({
  due_count: z.number().int().min(0),
  learning_count: z.number().int().min(0),
  mastered_count: z.number().int().min(0),
  new_count: z.number().int().min(0),
  next_due_date: z.string().nullable(),
})

export type GetVocabularySummaryResponse = z.infer<typeof getVocabularySummaryResponseSchema>

// ========================================================
// GET /api/vocabulary/session - 1 回分のカード
// ========================================================

/**
 * 1 回分のカードのレスポンススキーマ（最大 VOCABULARY_SESSION_SIZE 枚。今日の復習 → 新しい単語の順）
 */
export const getVocabularySessionResponseSchema = z.object({
  cards: z.array(
    z.object({
      /**
       * 正規化した見出し語（小文字）。答えの保存でそのまま送る
       */
      lemma: z.string(),
      meaning_ja: z.string(),
      /**
       * glossary は用語集の文脈での意味、dictionary は英和辞書の意味
       */
      meaning_source: z.enum(WORD_LOOKUP_SOURCES),
      note_ja: z.string().nullable(),
      part_of_speech: z.string().nullable(),
      passage: z.object({ id: z.number().int(), title: z.string() }),
      /**
       * 単語を含む本文の 1 文（インラインコードのバッククォートは残す）。highlight_* は文の中での単語の位置 [start, end)。見つからなければ null
       */
      sentence: z
        .object({ highlight_end: z.number().int(), highlight_start: z.number().int(), text: z.string() })
        .nullable(),
      /**
       * 答える前の段階（0〜3）。新しい単語は null
       */
      stage: z.number().int().min(0).max(3).nullable(),
      /**
       * 本文中の表記
       */
      surface: z.string(),
    }),
  ),
  /**
   * users.timezone での今日（YYYY-MM-DD）
   */
  today: z.string(),
})

export type GetVocabularySessionResponse = z.infer<typeof getVocabularySessionResponseSchema>
