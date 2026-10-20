import { isFetchablePath, normalizePageUrl } from "../src/url"

describe("normalizePageUrl", () => {
  describe("正常系", () => {
    it.each([
      ["クエリとフラグメントを除く", "https://go.dev/doc/effective_go?lang=en#names", "https://go.dev/doc/effective_go"],
      ["相対 URL を base で解決する", "../../ref/spec", "https://go.dev/ref/spec"],
      ["ルート相対の URL", "/blog/", "https://go.dev/blog/"],
      ["パスの無い URL は / になる", "https://go.dev", "https://go.dev/"],
      ["既定のポートは省く", "https://go.dev:443/doc/", "https://go.dev/doc/"],
    ])("%s", (_label, raw, expected) => {
      expect(normalizePageUrl(raw, "https://go.dev/doc/tutorial/")).toBe(expected)
    })

    it.each([
      ["http", "http://go.dev/doc/"],
      ["mailto", "mailto:golang@example.com"],
      ["javascript", "javascript:void(0)"],
      ["解決できない URL", "https://"],
    ])("%s は null", (_label, raw) => {
      expect(normalizePageUrl(raw, "https://go.dev/doc/")).toBeNull()
    })
  })
})

describe("isFetchablePath", () => {
  describe("正常系", () => {
    it.each(["/doc/", "/doc/effective_go", "/doc/install.html", "/ref/spec.htm", "/v1.2/guide"])("%s は取得する", (pathname) => {
      expect(isFetchablePath(pathname)).toBe(true)
    })

    it.each([
      "/doc/go1.pdf",
      "/dl/go1.23.zip",
      "/dl/go1.23.tar.gz",
      "/images/gopher.PNG",
      "/images/logo.svg",
      "/videos/intro.mp4",
      "/css/styles.css",
      "/js/site.js",
      "/feed.xml",
      "/robots.txt",
      "/data.json",
    ])("%s は取得しない", (pathname) => {
      expect(isFetchablePath(pathname)).toBe(false)
    })
  })
})
