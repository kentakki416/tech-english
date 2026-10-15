import type { DictionaryEntry } from "@repo/domain"

import { IRREGULAR_WORD_FORMS } from "../const/irregular-word-forms"

/**
 * 英和辞書の引き方（reading-practice README「英和辞書」）。DB を知らない純関数で、
 * 引く候補を順に並べ（generateLookupCandidates）、辞書から 1 回で取った項目のうち候補の順で最初のものを選ぶ（pickFirstEntry）
 */

/**
 * 語尾を外した後に残す語幹の最短の長さ（is → i、ped → p のような 1 文字の候補を作らない）
 */
const MIN_STEM_LENGTH = 2

/**
 * 語幹の末尾が「子音 + 母音 1 つ + 子音（w / x / y 以外）」（語頭なら「母音 + 子音」）か。
 * この形で終わる 1 音節の原形は語尾を付けるときに子音を重ねる（stop → stopped）ので、重ねずに付いているなら
 * e で終わる語が原形のことが多い（coding → code、used → use、notes → note）
 */
const SHORT_VOWEL_ENDING_PATTERN = /(?:^|[^aeiou])[aeiou][^aeiouwxy]$/

const DOUBLED_CONSONANT_PATTERN = /([^aeiou])\1$/

/**
 * 1. 小文字化し、’ を ' に、末尾の 's と ' を除く（React's → react、users' → users）
 */
const normalizeWord = (word: string): string =>
  word.trim().toLowerCase().replace(/’/g, "'").replace(/'s$/, "").replace(/'+$/, "")

/**
 * 不規則変化の表の原形。Object.prototype のキー（constructor など）を拾わないよう、自分のプロパティだけを見る
 */
const findIrregularBase = (word: string): string | null =>
  Object.prototype.hasOwnProperty.call(IRREGULAR_WORD_FORMS, word) ? IRREGULAR_WORD_FORMS[word] ?? null : null

/**
 * e で始まる語尾（-es / -ed / -er / -est）と -ing を外した語幹から候補を作る。
 * 外したままの語幹と e を補った語幹のどちらを先にするかは語幹の形で決め（SHORT_VOWEL_ENDING_PATTERN なら e を先に。
 * それ以外は外したままを先に: singing → sing、doing → do）、undoubleConsonant なら重なった子音を 1 つにしたものを最後に足す（running → run）
 */
const generateStemCandidates = (stem: string, undoubleConsonant: boolean): string[] => {
  if (stem.length < MIN_STEM_LENGTH) return []
  const withE = `${stem}e`
  const ordered = SHORT_VOWEL_ENDING_PATTERN.test(stem) ? [withE, stem] : [stem, withE]
  const undoubled = undoubleConsonant && DOUBLED_CONSONANT_PATTERN.test(stem) ? [stem.slice(0, -1)] : []
  return [...ordered, ...undoubled]
}

/**
 * -ies / -ied / -ier / -iest を外して y を付けた候補（libraries → library）
 */
const generateYCandidates = (word: string, suffix: string): string[] => {
  if (!word.endsWith(suffix)) return []
  const stem = word.slice(0, -suffix.length)
  return stem.length < MIN_STEM_LENGTH ? [] : [`${stem}y`]
}

/**
 * 語尾の規則で原形に戻した候補。
 * -ies → y / -es → なし・e（= -s を外したもの）/ -s → なし（-ss は除く）/ -ied → y / -ed → なし・e・子音の重なりを 1 つに /
 * -ing → なし・e・子音の重なりを 1 つに / -ier・-iest → y / -er・-est → なし・e・子音の重なりを 1 つに
 */
const generateSuffixCandidates = (word: string): string[] => {
  const pluralCandidates = word.endsWith("es")
    ? generateStemCandidates(word.slice(0, -2), false)
    : word.endsWith("s") && !word.endsWith("ss") && word.length - 1 >= MIN_STEM_LENGTH
      ? [word.slice(0, -1)]
      : []
  return [
    ...generateYCandidates(word, "ies"),
    ...pluralCandidates,
    ...generateYCandidates(word, "ied"),
    ...(word.endsWith("ed") ? generateStemCandidates(word.slice(0, -2), true) : []),
    ...(word.endsWith("ing") ? generateStemCandidates(word.slice(0, -3), true) : []),
    ...generateYCandidates(word, "ier"),
    ...generateYCandidates(word, "iest"),
    ...(word.endsWith("er") ? generateStemCandidates(word.slice(0, -2), true) : []),
    ...(word.endsWith("est") ? generateStemCandidates(word.slice(0, -3), true) : []),
  ]
}

/**
 * 1 語の候補：見出し語そのまま → 不規則変化の表 → 語尾の規則
 */
const generateWordCandidates = (word: string): string[] => {
  const irregularBase = findIrregularBase(word)
  return [word, ...(irregularBase === null ? [] : [irregularBase]), ...generateSuffixCandidates(word)]
}

/**
 * ハイフンつきの語で、前に付くだけで意味の中心ではない部分（re-render の re など）。部分の候補から除く
 */
const HYPHEN_PREFIXES = new Set(["anti", "co", "cross", "de", "inter", "multi", "non", "post", "pre", "re", "self", "sub", "un"])

/**
 * 辞書を引く順の候補（重複なし）。最初に辞書にあったものを使う。
 * ハイフンつきの語は、全体の候補 → 各部分の候補（前から。接頭辞の部分は除く）の順につなげる（re-render → re-render …、render …）
 */
export const generateLookupCandidates = (word: string): string[] => {
  const normalized = normalizeWord(word)
  const parts = normalized.includes("-")
    ? normalized.split("-").filter((part) => part.length > 0 && !HYPHEN_PREFIXES.has(part))
    : []
  const candidates = [normalized, ...parts].flatMap(generateWordCandidates).filter((candidate) => candidate.length > 0)
  return [...new Set(candidates)]
}

/**
 * 辞書の項目のうち、候補の順で最初に見つかったもの。どれも無ければ null
 */
export const pickFirstEntry = (candidates: string[], entries: DictionaryEntry[]): DictionaryEntry | null => {
  const entryByHeadword = new Map(entries.map((entry) => [entry.headword, entry]))
  for (const candidate of candidates) {
    const entry = entryByHeadword.get(candidate)
    if (entry) return entry
  }
  return null
}
