const CODE_FENCE_PATTERN = /^\s*(`{3,}|~{3,})/

/**
 * `:::note`・`:::`・`::: tip NOTE`・`:::{note}`（VitePress・Docusaurus・Starlight・MyST の囲み）と、
 * `/// note`・`//// tab | Python`（PyMdown の囲み）。
 * `:::` で始まっても MDX のコメントの閉じを含む行は消さない（消すとコメントが閉じず、読めていた文書が構文エラーになる）
 */
const CONTAINER_MARKER_PATTERN = /^\s*(:{3,}|\/{3,})(?!.*\*\/\})/

/**
 * `::note`・`::`・`:read-more{to="..."}`（Nuxt の MDC）
 */
const MDC_LINE_PATTERN = /^\s*(::[a-zA-Z-]*(\{.*\})?|:[a-zA-Z][\w-]*(\[.*\])?\{.*\})\s*$/

/**
 * `{* ../../docs_src/app.py *}`・`{!> file !}`（MkDocs の取り込み）
 */
const INCLUDE_LINE_PATTERN = /^\s*\{([*!]).*\1\}\s*$/

/**
 * `[[TOC]]`（VitePress の目次）
 */
const TABLE_OF_CONTENTS_LINE_PATTERN = /^\s*\[\[toc\]\]\s*$/i

/**
 * JS の `\s` は BOM（U+FEFF）にも一致するので、ファイルの先頭の見出しも合う
 */
const HEADING_LINE_PATTERN = /^\s*#{1,6}\s/

const HEADING_ANCHOR_PATTERN = /^\{\s*#[^\s{}]+\s*\}$/

/**
 * `:badge[v4.4]{color="info"}`（Nuxt の見出しの末尾の部品）
 */
const HEADING_BADGE_PATTERN = /:[a-zA-Z][\w-]*\[[^\]]*\]\{[^}]*\}\s*$/

const isSiteSyntaxLine = (line: string): boolean =>
  CONTAINER_MARKER_PATTERN.test(line)
  || MDC_LINE_PATTERN.test(line)
  || INCLUDE_LINE_PATTERN.test(line)
  || TABLE_OF_CONTENTS_LINE_PATTERN.test(line)
  || HEADING_ANCHOR_PATTERN.test(line.trim())

/**
 * 見出しの末尾の `{#id}`・`{ #id }` と、`:badge[...]{...}` を消す
 */
const removeHeadingSuffix = (line: string): string => {
  if (!HEADING_LINE_PATTERN.test(line)) return line
  const trimmed = line.trimEnd()
  const anchorStart = trimmed.lastIndexOf("{")
  const withoutAnchor = anchorStart !== -1 && HEADING_ANCHOR_PATTERN.test(trimmed.slice(anchorStart)) ? trimmed.slice(0, anchorStart).trimEnd() : trimmed
  return withoutAnchor.replace(HEADING_BADGE_PATTERN, "").trimEnd()
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
      return isSiteSyntaxLine(line) ? [] : [removeHeadingSuffix(line)]
    })
    .join("\n")
}
