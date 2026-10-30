const CODE_FENCE_PATTERN = /^\s*(`{3,}|~{3,})/

/**
 * `:::note`・`:::`・`::: tip NOTE`・`:::{note}`（VitePress・Docusaurus・Starlight・MyST の囲み）と、
 * `/// note`・`//// tab | Python`（PyMdown の囲み）
 */
const CONTAINER_MARKER_PATTERN = /^\s*(:{3,}|\/{3,})/

/**
 * `{* ../../docs_src/app.py *}`・`{!> file !}`（MkDocs の取り込み）
 */
const INCLUDE_LINE_PATTERN = /^\s*\{([*!]).*\1\}\s*$/

/**
 * `[[TOC]]`（VitePress の目次）
 */
const TABLE_OF_CONTENTS_LINE_PATTERN = /^\s*\[\[toc\]\]\s*$/i

const HEADING_LINE_PATTERN = /^#{1,6}\s/

const HEADING_ANCHOR_PATTERN = /^\{\s*#[^\s{}]+\s*\}$/

const isSiteSyntaxLine = (line: string): boolean =>
  CONTAINER_MARKER_PATTERN.test(line) || INCLUDE_LINE_PATTERN.test(line) || TABLE_OF_CONTENTS_LINE_PATTERN.test(line)

/**
 * 見出しの末尾の `{#id}`・`{ #id }` を消す
 */
const removeHeadingAnchor = (line: string): string => {
  if (!HEADING_LINE_PATTERN.test(line)) return line
  const trimmed = line.trimEnd()
  const anchorStart = trimmed.lastIndexOf("{")
  return anchorStart !== -1 && HEADING_ANCHOR_PATTERN.test(trimmed.slice(anchorStart)) ? trimmed.slice(0, anchorStart).trimEnd() : line
}

/**
 * サイトのビルドが処理する記法を消す。囲みの中の本文は残す。コードブロックの中は消さない。
 * MDX の `{* ... *}` や見出しの `{#id}` は式として読まれて構文エラーになるので、Markdown として読む前に消す。
 * 行を先頭から順に見て、コードブロックの中かどうかを openFence で次の行に引き継ぐ
 */
export const removeSiteSyntax = (source: string): string => {
  let openFence: string | null = null
  return source
    .split("\n")
    .flatMap((line) => {
      const marker = CODE_FENCE_PATTERN.exec(line)?.[1] ?? null
      if (openFence !== null) {
        if (marker !== null && marker[0] === openFence[0] && marker.length >= openFence.length) openFence = null
        return [line]
      }
      if (marker !== null) {
        openFence = marker
        return [line]
      }
      return isSiteSyntaxLine(line) ? [] : [removeHeadingAnchor(line)]
    })
    .join("\n")
}
