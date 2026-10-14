import { calculateContentHash } from "./content-hash"
import { convertMdastToBlocks } from "./convert-mdast-to-blocks"
import { parseHtml } from "./parse-html"
import { parseMarkdown } from "./parse-markdown"
import { countEnglishWords } from "./passage-rules"
import { splitIntoChunks, type PassageChunk } from "./split-into-chunks"

export type ExtractDocumentInput =
  | { content: string; fallbackTitle: string; format: "markdown" | "mdx" }
  | {
    content: string
    contentSelector: string | null
    excludeSelectors: string[]
    fallbackTitle: string
    format: "html"
    url: string
  }

export type ExtractedDocument = {
  candidates: PassageChunk[]
  /**
   * 条件を満たさなかった塊も含む（試し実行の表示用）
   */
  chunks: PassageChunk[]
  /**
   * 文書全体のブロックのハッシュ。source_documents.content_hash に入れる
   */
  contentHash: string
  /**
   * HTML のみ。ページ内の a[href] を絶対 URL にしたもの（リンクの発見用）。Markdown は []
   */
  links: string[]
  title: string
  wordCount: number
}

const parseDocument = (input: ExtractDocumentInput): ReturnType<typeof parseHtml> => {
  if (input.format === "html") {
    return parseHtml(input.content, {
      contentSelector: input.contentSelector,
      excludeSelectors: input.excludeSelectors,
      url: input.url,
    })
  }
  return { ...parseMarkdown(input.content, { isMdx: input.format === "mdx" }), links: [] }
}

/**
 * 文書（Markdown / MDX / HTML）から本文を抽出し、本文候補に切り分ける。DB も外部 API も使わない純関数
 *
 * 取得方法（GitHub / サイト）ごとの違いは呼び出し元に閉じ込め、ここから先は共通にする。
 * 壊れた MDX・不正な CSS セレクタは throw するので、呼び出し元が文書単位の失敗として扱う
 */
export const extractDocument = (input: ExtractDocumentInput): ExtractedDocument => {
  const { links, root, title: parsedTitle } = parseDocument(input)
  const title = parsedTitle ?? input.fallbackTitle
  const blocks = convertMdastToBlocks(root)
  const chunks = splitIntoChunks(blocks, title)
  return {
    candidates: chunks.filter((chunk) => chunk.rejectReasons.length === 0),
    chunks,
    contentHash: calculateContentHash(blocks),
    links,
    title,
    wordCount: countEnglishWords(blocks),
  }
}
