import type { ExtractedDocument, PassageChunk } from "@repo/content-extractor"

/**
 * 試し実行で取得した 1 文書の結果。抽出が throw した文書（壊れた MDX など）は failed
 */
export type DocumentPreview =
  | { document: ExtractedDocument; path: string; status: "extracted" }
  | { errorMessage: string; path: string; status: "failed" }

/**
 * 1 ソースの試し実行の結果
 */
export type SourcePreview = {
  documents: DocumentPreview[]
  /**
   * 取得元の表示（`owner/name @ コミットの SHA の先頭 7 文字`）
   */
  fetchedFrom: string
  /**
   * false はツリーが切り詰められ、対象の文書を全部は列挙できなかった
   */
  isComplete: boolean
  sourceId: number
  sourceName: string
  /**
   * 対象の文書の件数（取得したのはこのうち先頭の documents.length 件）
   */
  targetDocumentCount: number
}

/**
 * 塊の本文の表示に使う先頭の文字数
 */
const PREVIEW_TEXT_LENGTH = 120

/**
 * 塊の本文を 1 行にし、先頭 PREVIEW_TEXT_LENGTH 文字にする（サロゲートペアを切らないよう文字単位で数える）
 */
const buildPreviewText = (chunk: PassageChunk): string => {
  const characters = Array.from(chunk.blocks.map((block) => block.text).join(" ").replace(/\s+/g, " ").trim())
  const text = characters.slice(0, PREVIEW_TEXT_LENGTH).join("")
  return characters.length > PREVIEW_TEXT_LENGTH ? `${text}…` : text
}

const formatChunk = (chunk: PassageChunk): string[] => {
  const verdict = chunk.rejectReasons.length === 0 ? "OK" : `不採用: ${chunk.rejectReasons.join(", ")}`
  return [`  [${verdict}] ${chunk.title}（${chunk.wordCount} 語）`, `      ${buildPreviewText(chunk)}`]
}

const formatDocument = (preview: DocumentPreview): string[] => {
  if (preview.status === "failed") return [`■ ${preview.path}`, `  [抽出に失敗] ${preview.errorMessage}`]
  const { candidates, chunks, title, wordCount } = preview.document
  return [
    `■ ${preview.path}`,
    `  タイトル: ${title} / 英単語数: ${wordCount} / 本文候補: ${candidates.length} / 塊: ${chunks.length}`,
    ...chunks.flatMap(formatChunk),
  ]
}

/**
 * 試し実行（--dry-run）の結果を人が読むテキストにする。文書ごとに path・タイトル・英単語数、
 * 塊ごとに OK か不採用の理由・タイトル・語数・本文の先頭を並べる
 */
export const formatDryRun = (preview: SourcePreview): string => {
  const header = [
    `ソース #${preview.sourceId} ${preview.sourceName}（${preview.fetchedFrom}）`,
    `対象の文書 ${preview.targetDocumentCount} 件のうち ${preview.documents.length} 件を取得しました（DB には書き込んでいません）`,
    ...(preview.isComplete ? [] : ["※ ツリーが切り詰められたため、対象の文書を全部は列挙できていません"]),
  ]
  const sections = preview.documents.map((document) => formatDocument(document).join("\n"))
  return `${[header.join("\n"), ...sections].join("\n\n")}\n`
}
