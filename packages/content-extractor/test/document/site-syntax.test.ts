import { removeSiteSyntax } from "../../src/document/site-syntax"

describe("removeSiteSyntax", () => {
  describe("正常系", () => {
    it.each([
      ["VitePress", "::: tip NOTE\nBody text.\n:::\n"],
      ["Docusaurus", ":::note\n\nBody text.\n\n:::\n"],
      ["Starlight のラベル", ":::note[TypeScript users]\nBody text.\n:::\n"],
      ["MyST", ":::{note}\nBody text.\n:::\n"],
      ["入れ子", "::::tabs\nBody text.\n::::\n"],
      ["インデント", "  :::note\n  Body text.\n  :::\n"],
      ["PyMdown", "/// note\nBody text.\n///\n"],
      ["PyMdown のタブ", "//// tab | Python\nBody text.\n////\n"],
      ["Nuxt の MDC", "::tip\nBody text.\n::\n"],
      ["Nuxt の MDC の属性", "::note{to=\"/docs\"}\nBody text.\n::\n"],
    ])("%s の囲みの行を消し、本文を残す", (_label, source) => {
      expect(removeSiteSyntax(source).trim()).toBe("Body text.")
    })

    it.each([
      ["FastAPI の取り込み", "{* ../../docs_src/app/tutorial001.py hl[1,6:11] *}"],
      ["MkDocs の取り込み", "{!> ../../docs_src/app.py !}"],
      ["VitePress の目次", "[[TOC]]"],
      ["Nuxt の行内の部品", ":read-more{title=\"Nuxt rendering modes\" to=\"/docs/guide/concepts/rendering\"}"],
      ["見出しから離れたアンカー", "{ #stream }"],
    ])("%s の行を消す", (_label, line) => {
      expect(removeSiteSyntax(`Before.\n\n${line}\n\nAfter.`)).toBe("Before.\n\n\nAfter.")
    })

    it.each([
      ["バッククォート", "```text\n:::note\n{* file *}\n```"],
      ["チルダ", "~~~text\n:::note\n~~~"],
      ["閉じの長いフェンス", "````md\n```\n:::note\n```\n````"],
    ])("%s のコードブロックの中は消さない", (_label, source) => {
      expect(removeSiteSyntax(source)).toBe(source)
    })

    it.each([
      ["空白なし", "## Why Composition API? {#why-composition-api}", "## Why Composition API?"],
      ["空白あり", "# Concurrency and Burgers { #concurrency-and-burgers }", "# Concurrency and Burgers"],
      ["末尾の空白", "### Title {#title}  ", "### Title"],
      ["インデント", " ### group.instance.id {#group-instance-id}", " ### group.instance.id"],
      ["BOM", "\uFEFF# Plugins {#plugins}", "\uFEFF# Plugins"],
      ["Nuxt のバッジ", "## definePageMeta :badge[v4.4]{color=\"info\" variant=\"subtle\"}", "## definePageMeta"],
      ["ドットを含む", "# Vue.js Privacy Policy {#vue.js-privacy-policy}", "# Vue.js Privacy Policy"],
      ["英数字以外の記号を含む", "#### Web Accessibility Initiative (WAI-ARIA) {#web-accessibility-initiative-–-aria}", "#### Web Accessibility Initiative (WAI-ARIA)"],
    ])("見出しのアンカーを消す（%s）", (_label, line, expected) => {
      expect(removeSiteSyntax(line)).toBe(expected)
    })

    it.each([
      ["見出しでない行", "Use {#id} to link."],
      ["アンカーでない波括弧", "## Using {name} in templates"],
      ["文中のアンカー", "## Title {#id} continues"],
    ])("%s は変えない", (_label, line) => {
      expect(removeSiteSyntax(line)).toBe(line)
    })

    it("コードブロックの中の見出しのアンカーは消さない", () => {
      const source = "```md\n## Title {#id}\n```"

      expect(removeSiteSyntax(source)).toBe(source)
    })

    it("名前のある MDC の YAML の属性を閉じの --- まで消す", () => {
      expect(removeSiteSyntax("::card\n---\ntitle: Nuxt Vercel ISR\nto: https://example.com\n---\nBody text.\n::")).toBe("Body text.")
    })

    it("閉じの :: の後の区切り線は属性として扱わない", () => {
      expect(removeSiteSyntax("::\n---\nAfter.")).toBe("---\nAfter.")
    })

    it("空白の無い Hugo のショートコードの開始に空白を入れる", () => {
      expect(removeSiteSyntax("{{<note>}} Body. {{</note>}}")).toBe("{{< note>}} Body. {{< /note>}}")
    })

    it("MDX のコメントの閉じを含む行は消さない", () => {
      const source = "{/* :::note\nHidden.\n::: */}"

      expect(removeSiteSyntax(source)).toBe(source)
    })

    it("コードブロックの後の記法は消す", () => {
      expect(removeSiteSyntax("```\ncode\n```\n:::note\nBody.\n:::")).toBe("```\ncode\n```\nBody.")
    })

    it("文の途中の記号と、取り込みでない波括弧は消さない", () => {
      const source = "Use a::b::c here.\n\n{foo}\n\nRatio 2:::1\n\n:smile: is an emoji."

      expect(removeSiteSyntax(source)).toBe(source)
    })
  })
})
