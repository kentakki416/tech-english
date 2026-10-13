import { z } from "zod"

// ========================================================
// GET /api/dictionary?word= - 英和辞書の検索
// ========================================================

/**
 * 英和辞書の検索のクエリ文字列スキーマ。本文でタップした単語（英字で始まり、英字・アポストロフィ・ハイフンだけ）
 */
export const lookupDictionaryQueryStringSchema = z.object({
  word: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z'’-]*$/),
})

/**
 * 英和辞書の検索のレスポンススキーマ。headword は実際に見つかった見出し語（`running` を引いて `run` が返ることがある）
 */
export const lookupDictionaryResponseSchema = z.object({
  headword: z.string(),
  meaning_ja: z.string(),
})

export type LookupDictionaryQueryString = z.infer<typeof lookupDictionaryQueryStringSchema>
export type LookupDictionaryResponse = z.infer<typeof lookupDictionaryResponseSchema>
