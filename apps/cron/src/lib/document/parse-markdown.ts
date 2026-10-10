import type { Heading, Root, Yaml } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMdx from "remark-mdx"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { parseDocument } from "yaml"

import { convertPhrasingToText } from "./convert-mdast-to-blocks"

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

/**
 * Markdown / MDX を mdast にする。タイトルは frontmatter の title → 最初の h1 の順
 *
 * MDX の構文エラーは remark-mdx が throw する。ここでは握りつぶさず、呼び出し元が文書単位の失敗として扱う
 */
export const parseMarkdown = (source: string, options: { isMdx: boolean }): { root: Root; title: string | null } => {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml", "toml"]).use(remarkGfm)
  if (options.isMdx) processor.use(remarkMdx)
  const root = processor.parse(source)
  return { root, title: findFrontmatterTitle(root) ?? findFirstHeadingText(root, 1) }
}
