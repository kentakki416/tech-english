import type { PassageBlock } from "../types/passage"
import type { GlossaryEntry } from "../types/question"

/**
 * 本文中の位置の計算と照合。cron の後処理と api の保存・公開の検査が同じ判定を使うためにここに置く
 * （実装が 2 か所に分かれると、cron が作った用語集が api の公開の検査で落ちる）。
 *
 * 位置はすべて PassageBlock.text（インラインコードのバッククォートを含む生の文字列）上の UTF-16 の index で、[startOffset, endOffset)
 */

const ALPHANUMERIC_PATTERN = /[A-Za-z0-9]/

const BACKQUOTE_PATTERN = /`/g

/**
 * text の index の文字が英数字かどうか。範囲の外は英数字ではない扱い
 */
const isAlphanumericAt = (text: string, index: number): boolean =>
  index >= 0 && index < text.length && ALPHANUMERIC_PATTERN.test(text.charAt(index))

/**
 * surface を text から探し、前後が英数字でない（単語の途中でない）最初の出現の位置を返す。
 * 大文字小文字は区別する。見つからなければ null（surface が空文字のときも null）
 */
export const findSurfaceRange = (text: string, surface: string): { endOffset: number; startOffset: number } | null => {
  if (surface.length === 0) return null
  let startOffset = text.indexOf(surface)
  while (startOffset !== -1) {
    const endOffset = startOffset + surface.length
    if (!isAlphanumericAt(text, startOffset - 1) && !isAlphanumericAt(text, endOffset)) {
      return { endOffset, startOffset }
    }
    startOffset = text.indexOf(surface, startOffset + 1)
  }
  return null
}

/**
 * 保存済みの位置に、本文と同じ表記で surface があるか
 */
export const isSurfaceAt = (text: string, entry: Pick<GlossaryEntry, "endOffset" | "startOffset" | "surface">): boolean =>
  text.slice(entry.startOffset, entry.endOffset) === entry.surface

/**
 * 根拠の引用がブロックの本文に含まれるか。バッククォートを除いた文字列同士で比べる
 * （admin のプレビューもバッククォートを除いた本文で引用を探してハイライトする）。
 * バッククォートを除いて空になる引用は、どこも指していないので含まれない扱いにする
 */
export const hasQuote = (text: string, quote: string): boolean => {
  const normalizedQuote = quote.replace(BACKQUOTE_PATTERN, "")
  if (normalizedQuote.length === 0) return false
  return text.replace(BACKQUOTE_PATTERN, "").includes(normalizedQuote)
}

/**
 * ブロックごとの段落番号（1 始まり）。heading と code は数えず null。
 * 設問文の "paragraph 2"、要確認の理由・公開の条件の「段落 2」と対応する
 */
export const numberParagraphs = (blocks: Pick<PassageBlock, "type">[]): (number | null)[] => {
  let paragraphNumber = 0
  return blocks.map((block) => {
    if (block.type === "heading" || block.type === "code") return null
    paragraphNumber++
    return paragraphNumber
  })
}
