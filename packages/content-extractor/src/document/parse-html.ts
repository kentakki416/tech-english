import { Readability } from "@mozilla/readability"
import { JSDOM, VirtualConsole } from "jsdom"
import type { Root } from "mdast"
import rehypeParse from "rehype-parse"
import rehypeRemark, { type Options } from "rehype-remark"
import { unified } from "unified"

/**
 * 本文から常に取り除く要素（サイトのナビゲーション・フッター・スクリプトなど）
 */
const REMOVED_SELECTORS = ["nav", "header", "footer", "aside", "script", "style", "button", "[aria-hidden=\"true\"]"]

/**
 * 図（画像・グラフと、その題名・キャプション）は本文に残さない。画像のノードにするのは、捨てた内容として
 * 「:」で終わる段落の続きの判定に効かせるため。コードと引用は `<figure>` で包むサイトがあるので（rehype-pretty-code・WordPress）、
 * それらを含む図は中身を残し、キャプションだけ捨てる
 */
const FIGURE_HANDLERS: NonNullable<Options["handlers"]> = {
  figcaption: () => undefined,
  figure: (state, node) => {
    const children = state.toFlow(state.all(node))
    return children.some((child) => child.type === "code" || child.type === "blockquote") ? children : { type: "image", url: "" }
  },
}

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim()

const removeElements = (root: ParentNode, selectors: string[]): void => {
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      element.remove()
    })
  }
}

/**
 * CSS セレクタで本文の要素を取り出す。要素が無ければ null（本文 0 語になり、URL から追加の確認で気付ける）
 */
const selectContentHtml = (document: Document, contentSelector: string, excludeSelectors: string[]): string | null => {
  const content = document.querySelector(contentSelector)
  if (!content) return null
  removeElements(content, [...REMOVED_SELECTORS, ...excludeSelectors])
  return content.innerHTML
}

/**
 * Readability で本文を推定して取り出す。Readability は DOM を書き換えるので複製に対して行う。
 * Readability は既定で class を消すので keepClasses を指定する（`<code class="language-go">` の lang を rehype-remark が読むため）
 */
const extractContentHtmlWithReadability = (document: Document, excludeSelectors: string[]): string | null => {
  const clone = document.cloneNode(true) as Document
  removeElements(clone, [...REMOVED_SELECTORS, ...excludeSelectors])
  return new Readability(clone, { keepClasses: true }).parse()?.content ?? null
}

/**
 * HTML を mdast にする。タイトルは `<title>` → 最初の h1 の順
 *
 * 不正な CSS セレクタは jsdom が throw する。呼び出し元が文書単位の失敗として扱う
 */
export const parseHtml = (
  html: string,
  options: { contentSelector: string | null; excludeSelectors: string[]; url: string },
): { root: Root; title: string | null } => {
  /**
   * jsdom は既定でスクリプトを実行せず外部リソースも読まない。runScripts / resources は指定しない。
   * CSS の解析エラーなどを標準エラーに流さないよう、出力先の無い VirtualConsole を渡す
   */
  const dom = new JSDOM(html, { url: options.url, virtualConsole: new VirtualConsole() })
  try {
    const { document } = dom.window
    const title = normalizeWhitespace(document.title)
      || normalizeWhitespace(document.querySelector("h1")?.textContent ?? "")
      || null
    const contentHtml = options.contentSelector
      ? selectContentHtml(document, options.contentSelector, options.excludeSelectors)
      : extractContentHtmlWithReadability(document, options.excludeSelectors)
    const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeRemark, { handlers: FIGURE_HANDLERS })
    const root = processor.runSync(processor.parse(contentHtml ?? ""))
    return { root, title }
  } finally {
    dom.window.close()
  }
}
