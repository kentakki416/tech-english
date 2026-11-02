import { convertUppercaseHeadings } from "../../src/document/convert-uppercase-headings"

import { buildHeading } from "./helpers"

const convertHeading = (heading: string, prose: string): string | undefined =>
  convertUppercaseHeadings([buildHeading(heading, 2), { text: prose, type: "paragraph" }])[0]?.text

describe("convertUppercaseHeadings", () => {
  describe("正常系", () => {
    it.each([
      ["1 語", "EXAMPLES", "These examples help.", "Examples"],
      ["複数の語", "EVAL DESIGN", "Every eval needs a good design.", "Eval design"],
      ["コマンド名", "/CLAUDE-API HILLCLIMB", "Use the claude-api skill to hillclimb.", "/claude-api hillclimb"],
      ["略語", "HTTPS", "Browsers use HTTPS by default.", "HTTPS"],
      ["略語を含む見出し", "REST API DESIGN", "A REST API needs a careful design.", "REST API design"],
      ["固有名", "OAUTH WITH GITHUB", "Sign in with OAuth through GitHub.", "OAuth with GitHub"],
      ["記号でつながった語", "NODE.JS AND CI/CD", "Run Node.js and CI/CD and more.", "Node.js and CI/CD"],
    ])("本文の書き方に合わせて文頭だけ大文字にする：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it("本文に書き方が複数あれば、多い方に合わせる", () => {
      expect(convertHeading("USING REACT", "React renders. React updates. Components react to state.")).toBe("Using React")
    })

    it("インラインコードは本文の書き方に数えない", () => {
      expect(convertHeading("JSON OUTPUT", "Set `json` and `json` to print JSON output.")).toBe("JSON output")
    })

    it.each([
      ["4 文字は略語として残す", "HTTP", "HTTP"],
      ["5 文字は小文字にする", "GUIDE", "Guide"],
      ["記号でつながった略語は残す", "Q&A", "Q&A"],
      ["文字だけを数える", "HTTP/2", "HTTP/2"],
      ["略語と一般の語が混ざる見出し", "FAQ OVERVIEW", "FAQ overview"],
    ])("本文に無い語は、短ければ大文字のまま残し、長ければ小文字にする：%s", (_, heading, expected) => {
      expect(convertHeading(heading, "Nothing related here.")).toBe(expected)
    })

    it("インラインコードは変えない", () => {
      expect(convertHeading("`useState` HOOK", "The hook stores state.")).toBe("`useState` hook")
    })

    it("見出しの深さを保つ", () => {
      expect(convertUppercaseHeadings([buildHeading("EXAMPLES", 3)])).toEqual([{ headingDepth: 3, text: "Examples", type: "heading" }])
    })

    it("見出しの書き方は本文の書き方に数えない", () => {
      const blocks = convertUppercaseHeadings([
        buildHeading("Deploy Guide", 2),
        buildHeading("DEPLOY GUIDE", 2),
      ])

      expect(blocks[1]?.text).toBe("Deploy guide")
    })

    it.each([
      ["小文字を含む見出し", "API Reference"],
      ["文字の無い見出し", "2026"],
      ["定数名の見出し", "MAX_RETRIES"],
      ["インラインコードだけの見出し", "`MAX_RETRIES`"],
    ])("%sは変えない", (_, heading) => {
      expect(convertHeading(heading, "Nothing related here.")).toBe(heading)
    })

    it("見出し以外のブロックは変えない", () => {
      const blocks = [
        { text: "READ THIS FIRST", type: "paragraph" as const },
        { text: "ALWAYS BACK UP", type: "list_item" as const },
        { text: "SELECT 1", type: "code" as const },
      ]

      expect(convertUppercaseHeadings(blocks)).toEqual(blocks)
    })
  })

  describe("異常系", () => {
    it("ブロックが無ければ空のまま", () => {
      expect(convertUppercaseHeadings([])).toEqual([])
    })
  })
})
