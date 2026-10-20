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
 * Kubernetes の用語のツールチップ（`{{< glossary_tooltip text="nodes" term_id="node" >}}`）。文の一部なので消さずに語に置き換える
 */
const GLOSSARY_TOOLTIP_PATTERN = /\{\{[<%]\s*glossary_tooltip\b(.*?)[%>]\}\}/g

/**
 * ショートコードの引数（`name="value"`）の値
 */
const findShortcodeArgument = (args: string, name: string): string | null =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(args)?.[1] ?? null

/**
 * glossary_tooltip を表示される語に置き換える。text が無ければ term_id（用語集の見出しの代わり）にする
 */
const replaceGlossaryTooltips = (text: string): string =>
  text.replace(GLOSSARY_TOOLTIP_PATTERN, (_match, args: string) =>
    findShortcodeArgument(args, "text") ?? findShortcodeArgument(args, "term_id") ?? "")

/**
 * GitHub の注記（`> [!NOTE]` / `> [!WARNING]` など）の先頭のマーカー
 */
const GITHUB_ALERT_MARKER_PATTERN = /^\[![A-Za-z]+\]\s*/

/**
 * コード以外のテキストを整える。ショートコードが改行をまたぐこともあるので、空白をまとめてから処理する。
 * glossary_tooltip は語に置き換え、それ以外のショートコードは消す
 */
const normalizeProseText = (text: string): string =>
  replaceGlossaryTooltips(text.replace(/\s+/g, " ")).replace(HUGO_SHORTCODE_PATTERN, "").replace(/\s+/g, " ").trim()

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
 * 段落の末尾の「:」。GitHub の絵文字のショートコード（`Happy hacking :rocket:`）の閉じの「:」は除く
 */
const DANGLING_COLON_PATTERN = /(?<!:[\w+-]+):$/

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g

const HTML_TAG_PATTERN = /<[^>]*>/g

const HTML_MEDIA_TAG_PATTERN = /<(?:iframe|img|picture|svg|table|video)\b/i

/**
 * テキストかメディアの要素を持つ HTML か。囲みのタグだけの HTML（`<div class="tabs">`）は、間の Markdown が兄弟のノードに残るので内容に数えない
 */
const hasHtmlContent = (html: string): boolean => {
  const withoutComments = html.replace(HTML_COMMENT_PATTERN, "")
  return HTML_MEDIA_TAG_PATTERN.test(withoutComments) || withoutComments.replace(HTML_TAG_PATTERN, "").trim() !== ""
}

/**
 * 画像か、画像をリンクで包んだもの（`[![diagram](d.png)](d.png)`・サイトの `<a><img></a>`）
 */
const isImageContent = (node: PhrasingContent): boolean => {
  switch (node.type) {
  case "image":
  case "imageReference":
    return true
  case "link":
  case "linkReference":
    return node.children.some(isImageContent)
  default:
    return false
  }
}

/**
 * 内容があるのに本文に残さないノード（文章を包むもの以外のコンポーネント・表・テキストかメディアのある HTML・画像のある段落）
 */
const isDroppedContentNode = (node: RootContent): boolean => {
  switch (node.type) {
  case "html":
    return hasHtmlContent(node.value)
  case "mdxJsxFlowElement":
  case "table":
    return true
  case "paragraph":
    return node.children.some(isImageContent)
  default:
    return false
  }
}

/**
 * index の段落の続きが本文に残らないか。後ろの兄弟をブロックを作るノードまで順に見て、その手前で内容のあるノードを捨てていたか、
 * 後ろにブロックを作るノードが無ければ true。空になって捨てられる内容の無いノード（ショートコード・コメントだけの段落、区切り線）は
 * 飛ばして先を見る（Kubernetes の `{{< tabs >}}` の後ろのコードを続きとみなすため）
 */
const isContinuationMissing = (nodes: RootContent[], convertedBlocks: DocumentBlock[][], index: number): boolean => {
  for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex++) {
    if ((convertedBlocks[nextIndex]?.length ?? 0) > 0) return false
    const nextNode = nodes[nextIndex]
    if (nextNode && isDroppedContentNode(nextNode)) return true
  }
  return true
}

/**
 * 兄弟のノード列を変換する。続きが本文に残らない段落は、末尾の「:」を「.」にする（指す先の無い「:」で文が終わらないように。
 * 文は消さない）。箇条書きの項目・引用の中は、段落をつないで 1 つのブロックにするので対象にしない
 */
const convertSiblingsFixingDanglingColons = (nodes: RootContent[]): DocumentBlock[] => {
  const convertedBlocks = nodes.map(convertNode)
  return convertedBlocks.flatMap((blocks, index) =>
    nodes[index]?.type === "paragraph" && isContinuationMissing(nodes, convertedBlocks, index)
      ? blocks.map((block) => ({ ...block, text: block.text.replace(DANGLING_COLON_PATTERN, ".") }))
      : blocks)
}

/**
 * 文章を包むコンポーネント（PROSE_COMPONENT_NAMES）はタグだけ除いて中身を変換し、それ以外のコンポーネントは中身ごと捨てる。
 * 名前の無いもの（フラグメント `<>`）も捨てる
 */
const convertJsxElement = (node: MdxJsxFlowElement): DocumentBlock[] =>
  node.name !== null && PROSE_COMPONENT_NAMES.has(node.name) ? convertSiblingsFixingDanglingColons(node.children) : []

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
export const convertMdastToBlocks = (root: Root): DocumentBlock[] => convertSiblingsFixingDanglingColons(root.children)
