import { ACRONYM_MAX_LETTERS } from "./const"
import type { DocumentBlock } from "./convert-mdast-to-blocks"
import { extractProseTexts, INLINE_CODE_PATTERN } from "./passage-rules"

/**
 * 語。記号でつながったものは 1 語にする（`claude-api`・`Node.js`・`CI/CD`・`Q&A`・`TL;DR`）
 */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’&./;][\p{L}\p{N}]+)*/gu

const INLINE_CODE_OR_WORD_PATTERN = new RegExp(`${INLINE_CODE_PATTERN.source}|${WORD_PATTERN.source}`, "gu")

/**
 * 語を部分に分ける（`HTML/CSS`・`API-first`）。`.` と `'` は 1 つの語の中の記号（`Node.js`・`it's`）なので分けない
 */
const WORD_PART_PATTERN = /[^-/&]+/g

/**
 * 短い語がこの記号を含むなら一般の語ではない（`Q&A`・`A/B`・`TL;DR`）。ハイフン・引用符は一般の語にも使う（`X-ray`・`don't`）
 */
const ACRONYM_SYMBOL_PATTERN = /[&/;]/

/**
 * 一人称の `I` とその短縮形（`I'VE`）。本文に出ないことが多く、小文字にすると誤った英語になる
 */
const FIRST_PERSON_PATTERN = /^I(?:['’]\p{L}+)?$/u

const POSSESSIVE_SUFFIX_PATTERN = /['’]S$/

/**
 * 見出しの先頭の番号（`1.`・`1)`・`(1)`・`1.2`・`1 -`）。記号の無い数字（`3 WAYS`・`2026 PLANS`）は文の一部なので番号に数えない
 */
const HEADING_NUMBER_SOURCE = String.raw`\(?\p{N}+(?:[.):]|(?:\.\p{N}+)+[.)]?|\s[-–—])\s+`

/**
 * 見出しの最初の語の先頭の小文字。番号と引用符の後ろも見る。
 * `/` で始まるコマンド名と、語の中に大文字がある語（`iPhone`・`macOS`）は合わない
 */
const FIRST_LETTER_PATTERN = new RegExp(String.raw`^((?:${HEADING_NUMBER_SOURCE})?["'“‘(]*)(\p{Ll})(?![\p{L}\p{N}]*\p{Lu})`, "u")

const hasOnlyUppercaseLetters = (text: string): boolean => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text)

/**
 * 本文の書き方を引くキー。引用符の種類の違い（`don't`・`don’t`）は同じ語として扱う
 */
const convertToSpellingKey = (word: string): string => word.toLowerCase().replace(/’/g, "'")

/**
 * 記号でつながった語の、大文字を含む部分（`CI/CD` の `CI`、`API-first` の `API`）。
 * 小文字だけの部分はパスのことが多いので除く（`vuejs/rfcs` の `rfcs` で `RFCS` を崩さないため）
 */
const extractPartsWithUppercase = (word: string): string[] => {
  const parts = word.match(WORD_PART_PATTERN) ?? []
  return parts.length > 1 ? parts.filter((part) => /\p{Lu}/u.test(part)) : []
}

/**
 * テキストの語を、convertToSpellingKey の値から最も多い書き方を引けるようにする。同数なら先に出た書き方
 */
const findMostFrequentSpellings = (texts: string[]): Map<string, string> => {
  const words = texts.flatMap((text) => text.match(WORD_PATTERN) ?? [])
  const counts = new Map<string, number>()
  for (const word of [...words, ...words.flatMap(extractPartsWithUppercase)]) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const spellings = new Map<string, string>()
  for (const [word, count] of counts) {
    const key = convertToSpellingKey(word)
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
 * 語の本文の書き方を返す。語の形が違うものも引く（所有格の `CLAUDE'S` は語幹の `Claude`、複数形の `APIS` は語幹が大文字の略語のときだけ `APIs`）
 */
const findWordSpelling = (word: string, spellings: Map<string, string>): string | undefined => {
  const spelling = spellings.get(convertToSpellingKey(word))
  if (spelling !== undefined) return spelling
  const possessiveSuffix = POSSESSIVE_SUFFIX_PATTERN.exec(word)?.[0]
  if (possessiveSuffix !== undefined) {
    const stem = spellings.get(convertToSpellingKey(word.slice(0, -possessiveSuffix.length)))
    return stem === undefined ? undefined : `${stem}${possessiveSuffix.toLowerCase()}`
  }
  const singular = spellings.get(convertToSpellingKey(word.replace(/S$/, "")))
  return singular !== undefined && hasOnlyUppercaseLetters(singular) ? `${singular}s` : undefined
}

/**
 * 定数名（`MAX_RETRIES`）の見出しは大文字が正しいので除く
 */
const isUppercaseHeading = (block: DocumentBlock): boolean => {
  if (block.type !== "heading") return false
  const [text = ""] = extractProseTexts([block])
  return hasOnlyUppercaseLetters(text) && !text.includes("_")
}

/**
 * 本文に無い短い語を略語とみなしてよい見出しか。1 語の見出し（`FAQ`）と、本文に出る語が無い見出しだけ。
 * ほかの語が本文に出る見出しはふつうの文で、本文に無い短い語は一般の語のことが多い（`HABITS THAT PAY OFF` の `PAY`）
 */
const canKeepShortWords = (text: string, spellings: Map<string, string>): boolean => {
  const words = text.replace(INLINE_CODE_PATTERN, " ").match(WORD_PATTERN) ?? []
  return words.length < 2 || !words.some((word) => findWordSpelling(word, spellings) !== undefined)
}

/**
 * 語の書き方を本文に合わせる。本文に無い語は、略語とみなせる語（1 文字の語、ACRONYM_SYMBOL_PATTERN を含む短い語、
 * canKeepShortWord のときの短い語）なら残し、それ以外は部分ごとに本文に合わせて、本文に無い部分は小文字にする（`API-FIRST` の `API` を残すため）
 */
const resolveWordSpelling = (word: string, spellings: Map<string, string>, canKeepShortWord: boolean): string => {
  if (FIRST_PERSON_PATTERN.test(word)) return `I${word.slice(1).toLowerCase()}`
  const spelling = findWordSpelling(word, spellings)
  if (spelling !== undefined) return spelling
  const letterCount = word.match(/\p{L}/gu)?.length ?? 0
  const isShortAcronym = letterCount <= ACRONYM_MAX_LETTERS && (canKeepShortWord || ACRONYM_SYMBOL_PATTERN.test(word))
  if (letterCount <= 1 || isShortAcronym) return word
  return word.replace(WORD_PART_PATTERN, (part) => findWordSpelling(part, spellings) ?? part.toLowerCase())
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
