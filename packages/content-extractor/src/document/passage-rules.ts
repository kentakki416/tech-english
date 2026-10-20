import type { PassageBlock } from "@repo/domain"

import {
  MAX_CODE_LINE_RATIO,
  MIN_ENGLISH_LETTER_RATIO,
  MIN_PROSE_LIST_ITEM_WORDS,
  MIN_PROSE_WORD_RATIO,
  PASSAGE_MAX_WORDS,
  PASSAGE_MIN_WORDS,
  PROSE_CHARS_PER_LINE,
} from "./const"

export type ChunkRejectReason = "not_english" | "not_prose" | "too_long" | "too_much_code" | "too_short"

const INLINE_CODE_PATTERN = /`[^`]*`/g

const WORD_CHARACTER_PATTERN = /[A-Za-z0-9]/

const isProseBlock = (block: PassageBlock): boolean => block.type !== "code"

/**
 * コード以外のブロックのテキストから、インラインコードを除いたもの
 */
const extractProseTexts = (blocks: PassageBlock[]): string[] =>
  blocks.filter(isProseBlock).map((block) => block.text.replace(INLINE_CODE_PATTERN, " "))

const countWordsInText = (text: string): number =>
  text.split(/\s+/).filter((token) => WORD_CHARACTER_PATTERN.test(token)).length

/**
 * 英単語数。コードブロックとインラインコードを除き、空白で区切ったうち英字か数字を 1 つ以上含むトークンを数える
 */
export const countEnglishWords = (blocks: PassageBlock[]): number =>
  extractProseTexts(blocks).reduce((sum, text) => sum + countWordsInText(text), 0)

/**
 * コードの行数 ÷（コードの行数 + 文章の行数）。文章の行数は PROSE_CHARS_PER_LINE 文字を 1 行とみなす
 */
const calculateCodeLineRatio = (blocks: PassageBlock[]): number => {
  const codeLines = blocks
    .filter((block) => !isProseBlock(block))
    .reduce((sum, block) => sum + block.text.split("\n").length, 0)
  const proseLines = blocks
    .filter(isProseBlock)
    .reduce((sum, block) => sum + Math.ceil(block.text.length / PROSE_CHARS_PER_LINE), 0)
  const totalLines = codeLines + proseLines
  return totalLines === 0 ? 0 : codeLines / totalLines
}

/**
 * コード以外・インラインコード除外のテキストで、文字（\p{L}）に占める ASCII 英字の割合。文字が 0 なら 0
 */
const calculateEnglishLetterRatio = (blocks: PassageBlock[]): number => {
  const text = extractProseTexts(blocks).join(" ")
  const letterCount = text.match(/\p{L}/gu)?.length ?? 0
  const asciiLetterCount = text.match(/[A-Za-z]/g)?.length ?? 0
  return letterCount === 0 ? 0 : asciiLetterCount / letterCount
}

const isProseWordBlock = (block: PassageBlock): boolean =>
  block.type === "paragraph"
  || block.type === "quote"
  || (block.type === "list_item" && countEnglishWords([block]) >= MIN_PROSE_LIST_ITEM_WORDS)

/**
 * paragraph・quote と MIN_PROSE_LIST_ITEM_WORDS 語以上の list_item の英単語数 ÷ 全体の英単語数
 * （短い項目の箇条書き・リンク集だけの塊を除くため）。英単語が 0 なら 0
 */
const calculateProseWordRatio = (blocks: PassageBlock[]): number => {
  const totalWords = countEnglishWords(blocks)
  const proseWords = countEnglishWords(blocks.filter(isProseWordBlock))
  return totalWords === 0 ? 0 : proseWords / totalWords
}

/**
 * 本文候補の条件を満たさない理由を返す。空なら本文候補。境界値はすべて通す側
 */
export const findRejectReasons = (blocks: PassageBlock[]): ChunkRejectReason[] => {
  const wordCount = countEnglishWords(blocks)
  const reasons: ChunkRejectReason[] = []
  if (wordCount < PASSAGE_MIN_WORDS) reasons.push("too_short")
  if (wordCount > PASSAGE_MAX_WORDS) reasons.push("too_long")
  if (calculateCodeLineRatio(blocks) > MAX_CODE_LINE_RATIO) reasons.push("too_much_code")
  if (calculateEnglishLetterRatio(blocks) < MIN_ENGLISH_LETTER_RATIO) reasons.push("not_english")
  if (calculateProseWordRatio(blocks) < MIN_PROSE_WORD_RATIO) reasons.push("not_prose")
  return reasons
}

export const forTesting = {
  calculateCodeLineRatio,
  calculateEnglishLetterRatio,
  calculateProseWordRatio,
}
