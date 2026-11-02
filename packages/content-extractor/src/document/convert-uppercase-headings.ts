import { ACRONYM_MAX_LETTERS } from "./const"
import type { DocumentBlock } from "./convert-mdast-to-blocks"
import { extractProseTexts } from "./passage-rules"

/**
 * 語。記号でつながったものは 1 語にする（`claude-api`・`Node.js`・`CI/CD`・`Q&A`・`TL;DR`）
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’&./;][\p{L}\p{N}]+)*/gu

const INLINE_CODE_OR_WORD_PATTERN = new RegExp(`\`[^\`]*\`|${WORD_PATTERN.source}`, "gu")

/**
 * 本文（見出し・コード・インラインコードを除く）の語を、小文字にした語から最も多い書き方を引けるようにする。同数なら先に出た書き方
 */
const findMostFrequentSpellings = (blocks: DocumentBlock[]): Map<string, string> => {
  const proseTexts = extractProseTexts(blocks.filter((block) => block.type !== "heading"))
  const counts = new Map<string, number>()
  for (const word of proseTexts.flatMap((text) => text.match(WORD_PATTERN) ?? [])) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const spellings = new Map<string, string>()
  for (const [word, count] of counts) {
    const key = word.toLowerCase()
    const current = spellings.get(key)
    if (current === undefined || count > (counts.get(current) ?? 0)) spellings.set(key, word)
  }
  return spellings
}

/**
 * 定数名（`MAX_RETRIES`）の見出しは大文字が正しいので除く
 */
const isUppercaseHeading = (block: DocumentBlock): boolean => {
  if (block.type !== "heading") return false
  const [text = ""] = extractProseTexts([block])
  return /\p{Lu}/u.test(text) && !/\p{Ll}|_/u.test(text)
}

/**
 * 語の書き方を本文に合わせる。本文に無い語は、短ければ略語とみなしてそのまま残し、長ければ小文字にする
 */
const resolveWordSpelling = (word: string, spellings: Map<string, string>): string => {
  const spelling = spellings.get(word.toLowerCase())
  if (spelling !== undefined) return spelling
  const letterCount = word.match(/\p{L}/gu)?.length ?? 0
  return letterCount <= ACRONYM_MAX_LETTERS ? word : word.toLowerCase()
}

const convertHeadingText = (text: string, spellings: Map<string, string>): string =>
  text
    .replace(INLINE_CODE_OR_WORD_PATTERN, (match) => (match.startsWith("`") ? match : resolveWordSpelling(match, spellings)))
    .replace(/^\p{Ll}/u, (letter) => letter.toUpperCase())

/**
 * 大文字だけで書かれた見出し（`EVAL DESIGN`）を、文頭だけ大文字の書き方（`Eval design`）にする。
 * 見出しの文字列だけでは略語（`HTTPS`）・固有名（`GitHub`）・コマンド名（`/claude-api`）と見分けられないので、
 * 辞書を持たず、その文書の本文の書き方に合わせる
 */
export const convertUppercaseHeadings = (blocks: DocumentBlock[]): DocumentBlock[] => {
  const spellings = findMostFrequentSpellings(blocks)
  return blocks.map((block) => (isUppercaseHeading(block) ? { ...block, text: convertHeadingText(block.text, spellings) } : block))
}
