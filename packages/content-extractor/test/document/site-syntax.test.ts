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
    ])("%s の囲みの行を消し、本文を残す", (_label, source) => {
      expect(removeSiteSyntax(source).trim()).toBe("Body text.")
    })

    it.each([
      ["FastAPI の取り込み", "{* ../../docs_src/app/tutorial001.py hl[1,6:11] *}"],
      ["MkDocs の取り込み", "{!> ../../docs_src/app.py !}"],
      ["VitePress の目次", "[[TOC]]"],
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

    it("コードブロックの後の記法は消す", () => {
      expect(removeSiteSyntax("```\ncode\n```\n:::note\nBody.\n:::")).toBe("```\ncode\n```\nBody.")
    })

    it("文の途中の記号と、取り込みでない波括弧は消さない", () => {
      const source = "Use a::b::c here.\n\n{foo}\n\nRatio 2:::1"

      expect(removeSiteSyntax(source)).toBe(source)
    })
  })
})
