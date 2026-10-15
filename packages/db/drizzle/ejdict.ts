/**
 * EJDict-hand（https://github.com/kujirahand/EJDict）の行を dictionary_entries の行に変換する純関数。
 * DB と通信を知らない（drizzle/ejdict.test.ts が node:test で検証する）
 */

export type EjdictEntry = {
  headword: string
  meaningJa: string
}

/**
 * 小文字化で同じ見出し語になったものの意味をつなげる区切り
 */
const MEANING_SEPARATOR = " / "

/**
 * EJDict-hand の行（`見出し語<TAB>意味`）を見出し語ごとの行にする。
 *
 * - 空行・TAB の無い行・意味が空の行は捨てる
 * - 見出し語がカンマ区切り（`color,colour`）なら分けて、それぞれ同じ意味で登録する
 * - 見出し語は前後の空白を除いて小文字化する（dictionary_entries の CHECK 制約 headword = lower(headword)）
 * - 小文字化で同じ見出し語になったもの（`Polish` / `polish`）は意味を ` / ` でつなげて 1 行にする（headword は unique）。
 *   同じ意味が重なる場合（`A,a,an` の `A` と `a`）は 1 つだけ残す
 * - 並びは見出し語が最初に出てきた順
 */
export const convertEjdictLinesToEntries = (lines: string[]): EjdictEntry[] => {
  const meaningsByHeadword = new Map<string, string[]>()
  for (const line of lines) {
    const tabIndex = line.indexOf("\t")
    if (tabIndex === -1) continue
    const meaningJa = line.slice(tabIndex + 1).trim()
    if (meaningJa.length === 0) continue
    const headwords = line
      .slice(0, tabIndex)
      .split(",")
      .map((headword) => headword.trim().toLowerCase())
      .filter((headword) => headword.length > 0)
    for (const headword of headwords) {
      const meanings = meaningsByHeadword.get(headword)
      if (!meanings) {
        meaningsByHeadword.set(headword, [meaningJa])
      } else if (!meanings.includes(meaningJa)) {
        meanings.push(meaningJa)
      }
    }
  }
  return Array.from(meaningsByHeadword, ([headword, meanings]) => ({
    headword,
    meaningJa: meanings.join(MEANING_SEPARATOR),
  }))
}
