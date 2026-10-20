import type { Blockquote, ListItem, Root, RootContent } from "mdast"

/**
 * MDX の JSX のブロック要素。`.md` の HTML ブロックで書かれたコンポーネントもこの形にそろえ、
 * 中身を残すか捨てるかを convertMdastToBlocks で `.mdx` と同じ規則で決める
 */
export type MdxJsxFlowElement = Extract<RootContent, { type: "mdxJsxFlowElement" }>

/**
 * 断片（コンポーネントの HTML ブロックの中の Markdown）を読んでノード列にする関数
 */
export type ParseFragment = (source: string) => RootContent[]

/**
 * MDX のコメント（`{/* anchor *\/}`）。react.dev の見出しのアンカーなど。複数行にまたがるもの（コメントアウトした節）も含む
 */
const MDX_COMMENT_PATTERN = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g

/**
 * コメントを消さないノード。コードとインラインコードの中は本文のまま残し、HTML の中は断片として読み直すときに消す
 */
const PROTECTED_NODE_TYPES = new Set(["code", "html", "inlineCode"])

/**
 * JSX のコンポーネントのタグ（名前が大文字で始まるもの）。小文字の HTML の要素は対象にしない。
 * グループは順に、終了タグの `/`・名前・自己終了タグの `/`
 */
const COMPONENT_TAG_PATTERN = /<(\/?)([A-Z][\w.]*)(?:\s[^<>]*?)?(\/?)>/g

/**
 * ソース上の範囲（end は含まない）
 */
type SourceRange = { end: number; start: number }

type HtmlToken =
  | { kind: "close"; name: string }
  | { kind: "markdown"; source: string }
  | { kind: "open"; name: string }

/**
 * 開始タグを読んで、終了タグをまだ読んでいないコンポーネント。name が null のものは一番外側
 */
type OpenComponent = { children: RootContent[]; name: string | null }

const collectProtectedRanges = (node: Root | RootContent, ranges: SourceRange[] = []): SourceRange[] => {
  if (PROTECTED_NODE_TYPES.has(node.type)) {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start !== undefined && end !== undefined) ranges.push({ end, start })
    return ranges
  }
  if ("children" in node) {
    for (const child of node.children) collectProtectedRanges(child, ranges)
  }
  return ranges
}

const isInRanges = (offset: number, ranges: SourceRange[]): boolean =>
  ranges.some(({ end, start }) => start <= offset && offset < end)

/**
 * `.md` のソースから MDX のコメントを消す。`.md` は素の Markdown として読むのでコメントが文字として残り、
 * 見出しのアンカーがタイトルや本文に入ってしまうため。
 * root は同じソースを読んだもので、コメントの始まりか終わりがコード・インラインコード・HTML の中にあれば消さない
 */
export const removeMdxComments = (source: string, root: Root): string => {
  const ranges = collectProtectedRanges(root)
  return source.replace(MDX_COMMENT_PATTERN, (comment: string, offset: number) => (
    isInRanges(offset, ranges) || isInRanges(offset + comment.length - 1, ranges) ? comment : ""
  ))
}

/**
 * HTML ブロックを、コンポーネントの開始タグ・終了タグと、その間の Markdown に分ける。コンポーネントのタグが無ければ null。
 * 自己終了タグ（`<Diagram />`）は開始タグと終了タグの組にし、中身の無いコンポーネントとして残す
 * （捨てる内容があったことを、convertMdastToBlocks の「:」で終わる段落の判定に使うため）
 */
const tokenizeHtml = (html: string): HtmlToken[] | null => {
  const matches = [...html.matchAll(COMPONENT_TAG_PATTERN)]
  if (matches.length === 0) return null
  const tokens: HtmlToken[] = []
  const pushMarkdown = (source: string): void => {
    if (source.trim()) tokens.push({ kind: "markdown", source })
  }
  let lastIndex = 0
  for (const match of matches) {
    const [tag, closingSlash, name, selfClosingSlash] = match
    pushMarkdown(html.slice(lastIndex, match.index))
    if (selfClosingSlash) tokens.push({ kind: "open", name }, { kind: "close", name })
    else tokens.push({ kind: closingSlash ? "close" : "open", name })
    lastIndex = match.index + tag.length
  }
  pushMarkdown(html.slice(lastIndex))
  return tokens
}

const buildJsxElement = (name: string, children: RootContent[]): MdxJsxFlowElement => ({
  attributes: [],
  children: children as MdxJsxFlowElement["children"],
  name,
  type: "mdxJsxFlowElement",
})

/**
 * 兄弟のノード列の中で、HTML ブロックのコンポーネントの開始タグから対応する終了タグまでを 1 つの mdxJsxFlowElement にまとめる。
 * HTML ブロックの中にタグと一緒に書かれた Markdown（空行を挟まずに書いた中身）は parseFragment で読み直す。
 * 対応する開始タグの無い終了タグは無視し、閉じられていない開始タグは無かったことにする（中身は残す。壊れた `.md` で残りを全部捨てないため）
 */
const groupHtmlComponents = (children: RootContent[], parseFragment: ParseFragment): RootContent[] => {
  const stack: OpenComponent[] = [{ children: [], name: null }]
  const appendToInnermost = (nodes: RootContent[]): void => {
    stack[stack.length - 1].children.push(...nodes)
  }
  const unwrapInnermost = (): void => {
    const component = stack.pop()
    if (component) appendToInnermost(component.children)
  }
  const closeComponent = (name: string): void => {
    let index = stack.length - 1
    while (index > 0 && stack[index].name !== name) index -= 1
    if (index === 0) return
    while (stack.length - 1 > index) unwrapInnermost()
    const component = stack.pop()
    if (component) appendToInnermost([buildJsxElement(name, component.children)])
  }

  for (const child of children) {
    const tokens = child.type === "html" ? tokenizeHtml(child.value) : null
    if (tokens === null) {
      appendToInnermost([child])
      continue
    }
    for (const token of tokens) {
      if (token.kind === "markdown") appendToInnermost(parseFragment(token.source))
      else if (token.kind === "open") stack.push({ children: [], name: token.name })
      else closeComponent(token.name)
    }
  }
  while (stack.length > 1) unwrapInnermost()
  return stack[0].children
}

/**
 * 引用・箇条書きの項目の中の HTML ブロックも処理する
 */
const convertComponentsInContainer = (node: RootContent, parseFragment: ParseFragment): RootContent => {
  switch (node.type) {
  case "blockquote":
    return { ...node, children: convertHtmlComponentsToJsx(node.children, parseFragment) as Blockquote["children"] }
  case "list":
    return {
      ...node,
      children: node.children.map((item) => ({
        ...item,
        children: convertHtmlComponentsToJsx(item.children, parseFragment) as ListItem["children"],
      })),
    }
  default:
    return node
  }
}

/**
 * `.md` の HTML ブロックで書かれたコンポーネント（`<Note>` … `</Note>`）を mdxJsxFlowElement にする。
 * remark-parse はタグの行と中身を別の兄弟のノードにする（空行を挟まなければ中身ごと 1 つの HTML ブロックにする）ので、
 * 開始タグから終了タグまでをまとめ直す。中身を残すかどうかは convertMdastToBlocks が決める
 */
export const convertHtmlComponentsToJsx = (children: RootContent[], parseFragment: ParseFragment): RootContent[] =>
  groupHtmlComponents(children.map((child) => convertComponentsInContainer(child, parseFragment)), parseFragment)
