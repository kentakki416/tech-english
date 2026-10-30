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
 * 名前のある MDC の開始の行。次の行が `---` なら、閉じの `---` までが YAML の属性
 */
const MDC_BLOCK_OPENING_PATTERN = /^\s*::[a-zA-Z]/

const MDC_PROPS_DELIMITER = "---"

/**
 * 空白の無い `{{<note>}}` の開始。`<note>` が HTML として読まれて `{{}}` が残るので、空白を入れて文字列のまま読ませる
 * （残った `{{}}` を後で消すと、文書が説明している `{{ }}` まで消える）
 */
const HUGO_SHORTCODE_OPENING_PATTERN = /\{\{<(?=[/\w])/g

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
 * 行を先頭から順に見て、コードブロックの中か・MDC の属性の中かを openFence・mdcPropsState で次の行に引き継ぐ
 */
export const removeSiteSyntax = (source: string): string => {
  let openFence: string | null = null
  let mdcPropsState: "after_opening" | "inside" | "outside" = "outside"
  return source
    .split("\n")
    .flatMap((line) => {
      if (mdcPropsState === "inside") {
        if (line.trim() === MDC_PROPS_DELIMITER) mdcPropsState = "outside"
        return []
      }
      if (mdcPropsState === "after_opening" && line.trim() === MDC_PROPS_DELIMITER) {
        mdcPropsState = "inside"
        return []
      }
      mdcPropsState = "outside"
      const marker = CODE_FENCE_PATTERN.exec(line)?.[1] ?? null
      if (openFence !== null) {
        if (marker !== null && marker[0] === openFence[0] && marker.length >= openFence.length) openFence = null
        return [line]
      }
      if (marker !== null) {
        openFence = marker
        return [line]
      }
      if (MDC_BLOCK_OPENING_PATTERN.test(line)) mdcPropsState = "after_opening"
      return isSiteSyntaxLine(line) ? [] : [removeHeadingSuffix(line).replace(HUGO_SHORTCODE_OPENING_PATTERN, "{{< ")]
    })
    .join("\n")
}
