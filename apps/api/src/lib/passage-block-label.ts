import { numberParagraphs, type PassageBlock } from "@repo/domain"

/**
 * admin に返すメッセージでのブロックの表記（「段落 2」「見出し」「コード」）。
 * 段落の番号は numberParagraphs と同じ（設問文の "paragraph 2"、要確認の理由の「段落 2」と対応する）。範囲外は「ブロック n」
 */
export const formatBlockLabel = (blocks: Pick<PassageBlock, "type">[], blockIndex: number): string => {
  const block: Pick<PassageBlock, "type"> | undefined = blocks[blockIndex]
  if (!block) return `ブロック ${blockIndex + 1}`
  if (block.type === "heading") return "見出し"
  if (block.type === "code") return "コード"
  return `段落 ${numberParagraphs(blocks)[blockIndex]}`
}

/**
 * ブロックの表記に続きの文を付ける。表記の末尾が数字なら空白を挟む（「段落 2 の本文」「見出しの本文」）
 */
export const joinBlockLabel = (label: string, rest: string): string =>
  (/\d$/.test(label) ? `${label} ${rest}` : `${label}${rest}`)
