import { ACRONYM_MAX_LETTERS } from "./const"
import type { DocumentBlock } from "./convert-mdast-to-blocks"
import { extractProseTexts, INLINE_CODE_PATTERN } from "./passage-rules"

/**
 * 語。記号でつながったものは 1 語にする（`claude-api`・`Node.js`・`CI/CD`・`Q&A`・`TL;DR`）
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’&./;][\p{L}\p{N}]+)*/gu

const INLINE_CODE_OR_WORD_PATTERN = new RegExp(`\`[^\`]*\`|${WORD_PATTERN.source}`, "gu")

/**
 * 語を部分に分ける（`HTML/CSS`・`API-first`）。`.` と `'` は 1 つの語の中の記号（`Node.js`・`it's`）なので分けない
 */
const WORD_PART_PATTERN = /[^-/&]+/g

const WORD_SYMBOL_PATTERN = /[^\p{L}\p{N}]/u

/**
 * 見出しの先頭の番号（`1.`・`1)`・`(1)`・`1.2`・`1 -`）。記号の無い数字（`3 WAYS`・`2026 PLANS`）は文の一部なので番号に数えない
 */
const HEADING_NUMBER_SOURCE = String.raw`\(?\p{N}+(?:[.):]|(?:\.\p{N}+)+[.)]?|\s[-–—])\s+`

/**
 * 見出しの最初の語の先頭の小文字。番号と引用符の後ろも見る。
 * `/` で始まるコマンド名と、語の中に大文字がある語（`iPhone`・`macOS`）は合わない
 */
const FIRST_LETTER_PATTERN = new RegExp(String.raw`^((?:${HEADING_NUMBER_SOURCE})?["'“‘(]*)(\p{Ll})(?![\p{L}\p{N}]*\p{Lu})`, "u")

/**
 * テキストの語を、小文字にした語から最も多い書き方を引けるようにする。同数なら先に出た書き方
 */
const findMostFrequentSpellings = (texts: string[]): Map<string, string> => {
  const counts = new Map<string, number>()
  for (const word of texts.flatMap((text) => text.match(WORD_PATTERN) ?? [])) {
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
 * 文書の本文（見出し・コードブロックを除く）の語の書き方を引けるようにする。文章の書き方を優先し（設定値の `json` より文章の `JSON`）、
 * 文章に無い語はインラインコードの書き方にする（`useEffect`・`/claude-api`）
 */
const buildWordSpellings = (blocks: DocumentBlock[]): Map<string, string> => {
  const bodyBlocks = blocks.filter((block) => block.type !== "heading" && block.type !== "code")
  const inlineCodes = bodyBlocks.flatMap((block) => block.text.match(INLINE_CODE_PATTERN) ?? [])
  return new Map([...findMostFrequentSpellings(inlineCodes), ...findMostFrequentSpellings(extractProseTexts(bodyBlocks))])
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
 * 本文に無い短い語を略語とみなしてよい見出しか。1 語の見出し（`FAQ`）と、本文に出る語が無い見出しだけ。
 * ほかの語が本文に出る見出しはふつうの文で、本文に無い短い語は一般の語のことが多い（`HABITS THAT PAY OFF` の `PAY`）
 */
const canKeepShortWords = (text: string, spellings: Map<string, string>): boolean => {
  const words = text.replace(INLINE_CODE_PATTERN, " ").match(WORD_PATTERN) ?? []
  return words.length < 2 || !words.some((word) => spellings.has(word.toLowerCase()))
}

/**
 * 語の書き方を本文に合わせる。本文に無い語は、短い略語なら残し（記号でつながった短い語〈`Q&A`〉は一般の語ではないので、
 * canKeepShortWord が false でも残す）、それ以外は部分ごとに本文に合わせて、本文に無い部分は小文字にする（`API-FIRST` の `API` を残すため）
 */
const resolveWordSpelling = (word: string, spellings: Map<string, string>, canKeepShortWord: boolean): string => {
  const spelling = spellings.get(word.toLowerCase())
  if (spelling !== undefined) return spelling
  const letterCount = word.match(/\p{L}/gu)?.length ?? 0
  if (letterCount <= ACRONYM_MAX_LETTERS && (canKeepShortWord || WORD_SYMBOL_PATTERN.test(word))) return word
  return word.replace(WORD_PART_PATTERN, (part) => spellings.get(part.toLowerCase()) ?? part.toLowerCase())
}

const convertHeadingText = (text: string, spellings: Map<string, string>): string => {
  const canKeepShortWord = canKeepShortWords(text, spellings)
  return text
    .replace(INLINE_CODE_OR_WORD_PATTERN, (match) => (match.startsWith("`") ? match : resolveWordSpelling(match, spellings, canKeepShortWord)))
    .replace(FIRST_LETTER_PATTERN, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
}

/**
 * 大文字だけで書かれた見出し（`EVAL DESIGN`）を、文頭だけ大文字の書き方（`Eval design`）にする。
 * 見出しの文字列だけでは略語（`HTTPS`）・固有名（`GitHub`）・コマンド名（`/claude-api`）と見分けられないので、
 * 辞書を持たず、その文書の本文の書き方に合わせる
 */
export const convertUppercaseHeadings = (blocks: DocumentBlock[]): DocumentBlock[] => {
  const spellings = buildWordSpellings(blocks)
  return blocks.map((block) => (isUppercaseHeading(block) ? { ...block, text: convertHeadingText(block.text, spellings) } : block))
}
