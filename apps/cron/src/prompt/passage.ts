import { numberParagraphs, type PassageBlock } from "@repo/domain"

/**
 * 属性値のエスケープ。ブロックの本文はエスケープしない（コードの `<` `&` をそのままモデルに見せる）が、
 * 属性値は引用符や `<` で要素の区切りと紛れないようにエスケープする
 */
const escapeAttributeValue = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * [名前, 値] の並びを ` name="value"` の列にする。値が undefined の属性は出さない（並び順は引数の順）
 */
const buildAttributes = (attributes: [string, number | string | undefined][]): string =>
  attributes
    .flatMap(([name, value]) => (value === undefined ? [] : [` ${name}="${escapeAttributeValue(String(value))}"`]))
    .join("")

export type PassagePromptInput = {
  blocks: PassageBlock[]
  /**
   * 生成のときだけ付ける（作る設問の数）
   */
  questionCount?: number
  title: string
  wordCount: number
}

/**
 * 本文を番号つきのブロックの XML にする。生成と、解答キーを見ない検証の user message で共有する。
 *
 * - `index`：ブロック番号（0 始まり、全ブロック）。出力の blockIndex はこの番号
 * - `paragraph`：段落番号（1 始まり、`numberParagraphs`）。見出しとコードには付かない。設問文の "paragraph 2" はこの番号
 * - コードには `lang` と、和訳しない印の `translate="no"` を付ける
 * - 和訳（translationJa）は渡さない
 */
export const buildPassagePrompt = (input: PassagePromptInput): string => {
  const paragraphNumbers = numberParagraphs(input.blocks)
  const blockElements = input.blocks.map((block, index) => {
    const isCode = block.type === "code"
    const attributes = buildAttributes([
      ["index", index],
      ["type", block.type],
      ["paragraph", paragraphNumbers[index] ?? undefined],
      ["lang", isCode && block.lang ? block.lang : undefined],
      ["translate", isCode ? "no" : undefined],
    ])
    return `<block${attributes}>${block.text}</block>`
  })
  const passageAttributes = buildAttributes([
    ["title", input.title],
    ["word_count", input.wordCount],
    ["question_count", input.questionCount],
  ])
  return [`<passage${passageAttributes}>`, ...blockElements, "</passage>"].join("\n")
}
