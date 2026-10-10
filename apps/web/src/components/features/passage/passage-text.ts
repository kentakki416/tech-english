import type { ReaderGlossaryEntry } from "./types"

/**
 * 本文のセグメント（単語・空白・記号・インラインコード）
 *
 * 本実装では api が分割して返す（reading-practice spec の「本文のトークン化」）。
 * それまでの間（ログイン画面の体験デモなど）は同じ形をクライアントで作る。
 */
export type Segment = {
  glossaryId?: number
  kind: "code" | "punct" | "space" | "word"
  text: string
}

const WORD_PATTERN = /([A-Za-z][A-Za-z'’-]*)|(\s+)|([^A-Za-z\s]+)/g

const tokenizeWords = (text: string): Segment[] => {
  const tokens: Segment[] = []
  for (const match of text.matchAll(WORD_PATTERN)) {
    if (match[1]) tokens.push({ kind: "word", text: match[1] })
    else if (match[2]) tokens.push({ kind: "space", text: match[2] })
    else tokens.push({ kind: "punct", text: match[3] })
  }
  return tokens
}

/**
 * 用語集の語句（熟語を含む）を 1 つのセグメントにまとめ、残りを単語に分ける
 */
const segmentProse = (text: string, entries: ReaderGlossaryEntry[]): Segment[] => {
  const matches = entries
    .map(entry => ({ entry, index: text.indexOf(entry.surface) }))
    .filter(match => match.index >= 0)
    .sort((a, b) => a.index - b.index)

  const segments: Segment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.index < cursor) continue
    segments.push(...tokenizeWords(text.slice(cursor, match.index)))
    segments.push({ glossaryId: match.entry.id, kind: "word", text: match.entry.surface })
    cursor = match.index + match.entry.surface.length
  }
  segments.push(...tokenizeWords(text.slice(cursor)))
  return segments
}

/**
 * ブロックの本文をセグメントに分ける。バッククォートで囲まれた部分はインラインコード
 */
export const segmentText = (text: string, entries: ReaderGlossaryEntry[]): Segment[] =>
  text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .flatMap(part =>
      part.startsWith("`") && part.endsWith("`")
        ? [{ kind: "code" as const, text: part.slice(1, -1) }]
        : segmentProse(part, entries),
    )

/**
 * 英和辞書を引く。見出し語そのまま → 語尾の規則を外した候補の順に試す
 */
export const lookUpDictionary = (
  word: string,
  dictionary: Record<string, string>,
): { lemma: string, meaningJa: string } | null => {
  const lower = word.toLowerCase().replace(/['’]s$/, "")
  const candidates = [
    lower,
    lower.replace(/ies$/, "y"),
    lower.replace(/es$/, ""),
    lower.replace(/s$/, ""),
    lower.replace(/ed$/, ""),
    lower.replace(/ed$/, "e"),
    lower.replace(/ing$/, ""),
    lower.replace(/ing$/, "e"),
    lower.replace(/d$/, ""),
  ]
  const lemma = candidates.find(candidate => dictionary[candidate])
  return lemma ? { lemma, meaningJa: dictionary[lemma] } : null
}
