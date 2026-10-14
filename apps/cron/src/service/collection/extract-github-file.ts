import path from "node:path"

import { extractDocument, type ExtractedDocument } from "../../lib/document"

/**
 * GitHub の Markdown ファイルの本文を抽出して本文候補に切り分ける。`.mdx` は MDX として読む。
 * frontmatter の title も h1 も無ければファイル名（拡張子なし）をタイトルにする。壊れた MDX は throw する
 */
export const extractGitHubFile = (filePath: string, content: string): ExtractedDocument => {
  const extension = path.posix.extname(filePath)
  return extractDocument({
    content,
    fallbackTitle: path.posix.basename(filePath, extension),
    format: extension.toLowerCase() === ".mdx" ? "mdx" : "markdown",
  })
}
