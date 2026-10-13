import { JSDOM } from "jsdom"

/**
 * sitemap の 1 エントリ（`<url>` か `<sitemap>`）
 */
export type SitemapEntry = {
  /**
   * `<lastmod>`。無い・日時として読めなければ null
   */
  lastmod: Date | null
  loc: string
}

/**
 * sitemap を読んだ結果。urlset なら urls、sitemap index なら sitemaps に入り、もう一方は空。壊れた XML はどちらも空
 */
export type ParsedSitemap = {
  sitemaps: SitemapEntry[]
  urls: SitemapEntry[]
}

const EMPTY_SITEMAP: ParsedSitemap = { sitemaps: [], urls: [] }

const parseLastmod = (text: string | undefined): Date | null => {
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 要素の直下の子要素のテキスト（名前空間の接頭辞は問わない）
 */
const findChildText = (element: Element, localName: string): string | undefined =>
  [...element.children].find((child) => child.localName === localName)?.textContent?.trim() || undefined

const readEntries = (document: Document, localName: string): SitemapEntry[] =>
  [...document.getElementsByTagNameNS("*", localName)].flatMap((element) => {
    const loc = findChildText(element, "loc")
    return loc ? [{ lastmod: parseLastmod(findChildText(element, "lastmod")), loc }] : []
  })

/**
 * sitemap の XML（urlset / sitemapindex）を読む。jsdom の XML モードで解析する（外部実体は解決しない）。
 * 壊れた XML・どちらでもないルート要素は空にする
 */
export const parseSitemap = (xml: string): ParsedSitemap => {
  let dom: JSDOM
  try {
    dom = new JSDOM(xml, { contentType: "application/xml" })
  } catch {
    return EMPTY_SITEMAP
  }
  try {
    const { document } = dom.window
    switch (document.documentElement.localName) {
    case "urlset":
      return { sitemaps: [], urls: readEntries(document, "url") }
    case "sitemapindex":
      return { sitemaps: readEntries(document, "sitemap"), urls: [] }
    default:
      return EMPTY_SITEMAP
    }
  } finally {
    dom.window.close()
  }
}
