import type { Heading, Root, Yaml } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { parseDocument } from "yaml"

import { convertPhrasingToText } from "./convert-mdast-to-blocks"
import { convertHtmlComponentsToJsx, removeMdxComments } from "./markdown-jsx"
import { removeSiteSyntax } from "./site-syntax"

/**
 * frontmatter（YAML）の `title` を返す。YAML が壊れている・title が文字列でないときは null（throw しない）
 */
const findFrontmatterTitle = (root: Root): string | null => {
  const frontmatter = root.children.find((node): node is Yaml => node.type === "yaml")
  if (!frontmatter) return null
  try {
    const document = parseDocument(frontmatter.value)
    if (document.errors.length > 0) return null
    const data: unknown = document.toJS()
    if (typeof data !== "object" || data === null || !("title" in data)) return null
    const { title } = data
    return typeof title === "string" && title.trim() ? title.trim() : null
  } catch {
    return null
  }
}

/**
 * 指定した深さの最初の見出しのテキストを返す
 */
const findFirstHeadingText = (root: Root, depth: Heading["depth"]): string | null => {
  const heading = root.children.find((node): node is Heading => node.type === "heading" && node.depth === depth)
  return (heading && convertPhrasingToText(heading.children)) || null
}

const parseMdx = (source: string): Root =>
  unified().use(remarkParse).use(remarkFrontmatter, ["yaml", "toml"]).use(remarkGfm).use(remarkMdx).parse(source)

/**
 * `.md` を素の Markdown として読む。react.dev のように MDX の書き方が混ざった `.md` もあるので、続けて以下を行う
 *
 * 1. MDX のコメント（見出しのアンカーなど）を消して読み直す（コードの中は消さない）
 * 2. HTML ブロックで書かれたコンポーネントを mdxJsxFlowElement にまとめる（HTML ブロックの中の Markdown は断片として同じ手順で読む）
 *
 * 断片はファイルの先頭ではないので frontmatter を読まない
 */
const parsePlainMarkdown = (source: string, options: { isFragment: boolean }): Root => {
  const processor = unified().use(remarkParse)
  if (!options.isFragment) processor.use(remarkFrontmatter, ["yaml", "toml"])
  processor.use(remarkGfm)
  const parsed = processor.parse(source)
  const sourceWithoutComments = removeMdxComments(source, parsed)
  const root = sourceWithoutComments === source ? parsed : processor.parse(sourceWithoutComments)
  const parseFragment = (fragment: string) => parsePlainMarkdown(fragment, { isFragment: true }).children
  return { ...root, children: convertHtmlComponentsToJsx(root.children, parseFragment) }
}

/**
 * Markdown / MDX を mdast にする。タイトルは frontmatter の title → 最初の h1 の順
 *
 * MDX の構文エラーは remark-mdx が throw する。ここでは握りつぶさず、呼び出し元が文書単位の失敗として扱う
 */
export const parseMarkdown = (source: string, options: { isMdx: boolean }): { root: Root; title: string | null } => {
  const sourceWithoutSiteSyntax = removeSiteSyntax(source)
  const root = options.isMdx ? parseMdx(sourceWithoutSiteSyntax) : parsePlainMarkdown(sourceWithoutSiteSyntax, { isFragment: false })
  return { root, title: findFrontmatterTitle(root) ?? findFirstHeadingText(root, 1) }
}
