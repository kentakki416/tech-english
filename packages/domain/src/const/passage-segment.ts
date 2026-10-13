/**
 * 本文のセグメントの種類（reading-practice README「本文のトークン化」）
 *
 * - code: インラインコード
 * - punct: 記号
 * - space: 空白
 * - word: 単語（用語集の熟語は複数の単語を 1 つにまとめる）
 */
export const PASSAGE_SEGMENT_KINDS = ["code", "punct", "space", "word"] as const
