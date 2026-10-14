import { numberHeadings, numberParagraphs, type PassageBlock } from "@repo/domain"

/**
 * admin に返すメッセージでのブロックの表記（「段落 2」「見出し 1」「コード」）。
 * 段落の番号は numberParagraphs と同じ（設問文の "paragraph 2"、要確認の理由の「段落 2」と対応する）。
 * 見出しの番号は numberHeadings と同じ（cron の要確認の理由と同じ規則。和訳の無い見出しが複数あっても区別できる）。範囲外は「ブロック n」
 */
export const formatBlockLabel = (blocks: Pick<PassageBlock, "type">[], blockIndex: number): string => {
  const block: Pick<PassageBlock, "type"> | undefined = blocks[blockIndex]
  if (!block) return `ブロック ${blockIndex + 1}`
  if (block.type === "heading") return `見出し ${numberHeadings(blocks)[blockIndex]}`
  if (block.type === "code") return "コード"
  return `段落 ${numberParagraphs(blocks)[blockIndex]}`
}

/**
 * ブロックの表記に続きの文を付ける。表記の末尾が数字なら空白を挟む（「段落 2 の本文」「コードの本文」）
 */
export const joinBlockLabel = (label: string, rest: string): string =>
  (/\d$/.test(label) ? `${label} ${rest}` : `${label}${rest}`)
