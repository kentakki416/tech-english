import type { Blockquote, Code, Heading, ListItem, Paragraph, PhrasingContent, Root, RootContent } from "mdast"

import type { PassageBlock } from "@repo/domain"

import { PROSE_COMPONENT_NAMES } from "./const"
import type { MdxJsxFlowElement } from "./markdown-jsx"

/**
 * 見出しの深さを持つブロック。切り分けにだけ使い、保存する前に PassageBlock に戻す
 */
export type DocumentBlock = PassageBlock & { headingDepth?: number }

/**
 * Hugo のショートコード（`{{< note >}}` / `{{% tab %}}`）。Kubernetes のドキュメントの Markdown に残る
 */
const HUGO_SHORTCODE_PATTERN = /\{\{[<%].*?[%>]\}\}/g

/**
 * GitHub の注記（`> [!NOTE]` / `> [!WARNING]` など）の先頭のマーカー
 */
const GITHUB_ALERT_MARKER_PATTERN = /^\[![A-Za-z]+\]\s*/

/**
 * コード以外のテキストを整える。ショートコードが改行をまたぐこともあるので、空白をまとめてから消す
 */
const normalizeProseText = (text: string): string =>
  text.replace(/\s+/g, " ").replace(HUGO_SHORTCODE_PATTERN, "").replace(/\s+/g, " ").trim()

/**
 * インラインのノードをテキストにする。インラインコードはバッククォートつきで残し、リンクはテキストだけ残す
 */
const convertInlineToText = (node: PhrasingContent): string => {
  switch (node.type) {
  case "text":
    return node.value
  case "inlineCode":
    return `\`${node.value}\``
  case "break":
    return " "
  case "footnoteReference":
  case "html":
  case "image":
  case "imageReference":
    return ""
  default:
    /**
     * emphasis / strong / delete / link / linkReference / mdxJsxTextElement は子を再帰する（link の URL は捨てる）。
     * mdxTextExpression のように子を持たないものは空にする
     */
    return "children" in node ? node.children.map(convertInlineToText).join("") : ""
  }
}

/**
 * インラインのノード列を、整えたテキストにする（見出し・段落の本文）
 */
export const convertPhrasingToText = (nodes: PhrasingContent[]): string =>
  normalizeProseText(nodes.map(convertInlineToText).join(""))

const convertHeading = (node: Heading): DocumentBlock[] => {
  const text = convertPhrasingToText(node.children)
  return text ? [{ headingDepth: node.depth, text, type: "heading" }] : []
}

const convertParagraph = (node: Paragraph): DocumentBlock[] => {
  const text = convertPhrasingToText(node.children)
  return text ? [{ text, type: "paragraph" }] : []
}

const convertCode = (node: Code): DocumentBlock[] => {
  const text = node.value.replace(/\n+$/, "")
  if (text.trim() === "") return []
  return node.lang ? [{ lang: node.lang, text, type: "code" }] : [{ text, type: "code" }]
}

/**
 * 箇条書きの項目・引用の子を変換する。続けて並んだ paragraph は 1 つの `type` のブロックにつなぎ、
 * それ以外の子（入れ子の list / code など）は再帰で変換する。入れ子の list は list_item として続けて並ぶ（1 段に平坦化）
 */
const convertContainerChildren = (
  children: RootContent[],
  type: "list_item" | "quote",
): DocumentBlock[] => {
  const blocks: DocumentBlock[] = []
  let paragraphTexts: string[] = []
  const flushParagraphs = (): void => {
    const joined = normalizeProseText(paragraphTexts.join(" "))
    const text = type === "quote" ? joined.replace(GITHUB_ALERT_MARKER_PATTERN, "") : joined
    if (text) blocks.push({ text, type })
    paragraphTexts = []
  }
  for (const child of children) {
    if (child.type === "paragraph") {
      paragraphTexts.push(convertPhrasingToText(child.children))
      continue
    }
    flushParagraphs()
    blocks.push(...convertNode(child))
  }
  flushParagraphs()
  return blocks
}

const convertListItem = (node: ListItem): DocumentBlock[] => convertContainerChildren(node.children, "list_item")

const convertBlockquote = (node: Blockquote): DocumentBlock[] => convertContainerChildren(node.children, "quote")

/**
 * 文章を包むコンポーネント（PROSE_COMPONENT_NAMES）はタグだけ除いて中身を変換し、それ以外のコンポーネントは中身ごと捨てる。
 * 名前の無いもの（フラグメント `<>`）も捨てる
 */
const convertJsxElement = (node: MdxJsxFlowElement): DocumentBlock[] =>
  node.name !== null && PROSE_COMPONENT_NAMES.has(node.name) ? node.children.flatMap(convertNode) : []

/**
 * table / image / html / thematicBreak / yaml / toml / definition / footnoteDefinition / MDX の ESM・式と、
 * 文章を包むもの以外の JSX のコンポーネントは捨てる
 */
const convertNode = (node: RootContent): DocumentBlock[] => {
  switch (node.type) {
  case "blockquote":
    return convertBlockquote(node)
  case "code":
    return convertCode(node)
  case "heading":
    return convertHeading(node)
  case "list":
    return node.children.flatMap(convertListItem)
  case "listItem":
    return convertListItem(node)
  case "mdxJsxFlowElement":
    return convertJsxElement(node)
  case "paragraph":
    return convertParagraph(node)
  default:
    return []
  }
}

/**
 * mdast を本文のブロック列にする。Markdown と HTML のどちらから作った mdast も同じ規則で変換する
 */
export const convertMdastToBlocks = (root: Root): DocumentBlock[] => root.children.flatMap(convertNode)
