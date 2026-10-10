import { Readability } from "@mozilla/readability"
import { JSDOM, VirtualConsole } from "jsdom"
import type { Root } from "mdast"
import rehypeParse from "rehype-parse"
import rehypeRemark from "rehype-remark"
import { unified } from "unified"

/**
 * 本文から常に取り除く要素（サイトのナビゲーション・フッター・スクリプトなど）
 */
const REMOVED_SELECTORS = ["nav", "header", "footer", "aside", "script", "style", "button", "[aria-hidden=\"true\"]"]

const LINK_PROTOCOLS = new Set(["http:", "https:"])

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim()

const removeElements = (root: ParentNode, selectors: string[]): void => {
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((element) => {
      element.remove()
    })
  }
}

/**
 * ページ内の a[href] を絶対 URL にして返す（jsdom が JSDOM の url を基準に解決する）。http / https だけで、重複を除く
 */
const extractLinks = (document: Document): string[] => {
  const links = [...document.querySelectorAll("a[href]")].flatMap((element) => {
    const href = (element as HTMLAnchorElement).href
    try {
      return LINK_PROTOCOLS.has(new URL(href).protocol) ? [href] : []
    } catch {
      return []
    }
  })
  return [...new Set(links)]
}

/**
 * CSS セレクタで本文の要素を取り出す。要素が無ければ null（本文 0 語になり、試し実行で気付ける）
 */
const selectContentHtml = (document: Document, contentSelector: string, excludeSelectors: string[]): string | null => {
  const content = document.querySelector(contentSelector)
  if (!content) return null
  removeElements(content, [...REMOVED_SELECTORS, ...excludeSelectors])
  return content.innerHTML
}

/**
 * Readability で本文を推定して取り出す。Readability は DOM を書き換えるので複製に対して行う
 */
const extractContentHtmlWithReadability = (document: Document, excludeSelectors: string[]): string | null => {
  const clone = document.cloneNode(true) as Document
  removeElements(clone, [...REMOVED_SELECTORS, ...excludeSelectors])
  return new Readability(clone).parse()?.content ?? null
}

/**
 * HTML を mdast にする。タイトルは `<title>` → 最初の h1 の順
 *
 * 不正な CSS セレクタは jsdom が throw する。呼び出し元が文書単位の失敗として扱う
 */
export const parseHtml = (
  html: string,
  options: { contentSelector: string | null; excludeSelectors: string[]; url: string },
): { links: string[]; root: Root; title: string | null } => {
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
    /**
     * 本文の取り出しで DOM を書き換えるので、リンクは先に元の DOM から取る
     */
    const links = extractLinks(document)
    const contentHtml = options.contentSelector
      ? selectContentHtml(document, options.contentSelector, options.excludeSelectors)
      : extractContentHtmlWithReadability(document, options.excludeSelectors)
    const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeRemark)
    const root = processor.runSync(processor.parse(contentHtml ?? ""))
    return { links, root, title }
  } finally {
    dom.window.close()
  }
}
