import { parseSitemap } from "../../src/lib/parse-sitemap"

describe("parseSitemap", () => {
  describe("正常系", () => {
    it("urlset の loc と lastmod を urls に読む（lastmod が無い・読めないものは null）", () => {
      const xml = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        "  <url><loc> https://go.dev/doc/ </loc><lastmod>2026-10-01T12:00:00+09:00</lastmod></url>",
        "  <url><loc>https://go.dev/ref/spec</loc></url>",
        "  <url><loc>https://go.dev/blog/</loc><lastmod>not a date</lastmod></url>",
        "  <url><lastmod>2026-10-01</lastmod></url>",
        "</urlset>",
      ].join("\n")

      expect(parseSitemap(xml)).toEqual({
        sitemaps: [],
        urls: [
          { lastmod: new Date("2026-10-01T03:00:00.000Z"), loc: "https://go.dev/doc/" },
          { lastmod: null, loc: "https://go.dev/ref/spec" },
          { lastmod: null, loc: "https://go.dev/blog/" },
        ],
      })
    })

    it("sitemapindex の子を sitemaps に読む", () => {
      const xml = [
        "<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        "<sitemap><loc>https://go.dev/sitemap-1.xml</loc><lastmod>2026-09-30</lastmod></sitemap>",
        "<sitemap><loc>https://go.dev/sitemap-2.xml</loc></sitemap>",
        "</sitemapindex>",
      ].join("")

      expect(parseSitemap(xml)).toEqual({
        sitemaps: [
          { lastmod: new Date("2026-09-30T00:00:00.000Z"), loc: "https://go.dev/sitemap-1.xml" },
          { lastmod: null, loc: "https://go.dev/sitemap-2.xml" },
        ],
        urls: [],
      })
    })

    it("名前空間の接頭辞つきの要素も読む", () => {
      const xml = "<sm:urlset xmlns:sm=\"http://www.sitemaps.org/schemas/sitemap/0.9\"><sm:url><sm:loc>https://go.dev/doc/</sm:loc></sm:url></sm:urlset>"

      expect(parseSitemap(xml).urls).toEqual([{ lastmod: null, loc: "https://go.dev/doc/" }])
    })
  })

  describe("異常系", () => {
    it.each([
      ["閉じていないタグ", "<urlset><url><loc>https://go.dev/doc/"],
      ["XML でない", "not xml at all"],
      ["HTML", "<!doctype html><html><body>404</body></html>"],
      ["urlset でも sitemapindex でもないルート", "<rss><channel><item><loc>https://go.dev/</loc></item></channel></rss>"],
    ])("%s は空にする", (_label, xml) => {
      expect(parseSitemap(xml)).toEqual({ sitemaps: [], urls: [] })
    })
  })
})
