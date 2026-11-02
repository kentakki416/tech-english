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
      ["語の中に大文字がある固有名", "IPHONE SETUP", "Finish the setup on your iPhone.", "iPhone setup"],
      ["引用符で始まる見出し", "\"EVAL\" DESIGN", "Every eval needs a good design.", "\"Eval\" design"],
      ["数字で始まる語", "2FA SETUP", "Turn on 2fa during setup.", "2fa setup"],
    ])("本文の書き方に合わせて文頭だけ大文字にする：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it.each([
      ["1. EVAL DESIGN", "1. Eval design"],
      ["1) EVAL DESIGN", "1) Eval design"],
      ["1: EVAL DESIGN", "1: Eval design"],
      ["(1) EVAL DESIGN", "(1) Eval design"],
      ["1.2 EVAL DESIGN", "1.2 Eval design"],
      ["1.2. EVAL DESIGN", "1.2. Eval design"],
      ["1 - EVAL DESIGN", "1 - Eval design"],
    ])("番号の後ろの語を文頭として扱う：%s", (heading, expected) => {
      expect(convertHeading(heading, "Every eval needs a good design.")).toBe(expected)
    })

    it.each([
      ["3 WAYS TO RUN IT", "There are ways to run it.", "3 ways to run it"],
      ["2026 EVAL DESIGN", "Every eval needs a good design.", "2026 eval design"],
    ])("記号の無い数字は番号に数えない：%s", (heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it("本文に書き方が複数あれば、多い方に合わせる", () => {
      expect(convertHeading("USING REACT", "React renders. React updates. Components react to state.")).toBe("Using React")
    })

    it.each([
      ["略語", "API-FIRST DESIGN", "The API comes first in this design.", "API-first design"],
      ["固有名", "GITHUB-BASED WORKFLOWS", "Use GitHub for workflows.", "GitHub-based workflows"],
      ["本文に無い部分", "WELL-SCOPED GOALS", "Nothing related here.", "Well-scoped goals"],
      ["/ でつながった略語", "HTML/CSS BASICS", "Learn HTML and CSS basics.", "HTML/CSS basics"],
      ["& でつながった固有名", "REACT&VUE GUIDE", "A guide to React and Vue.", "React&Vue guide"],
      ["ピリオドは分けない", "REACT/NEXT.JS GUIDE", "A guide to React and Next.js.", "React/Next.js guide"],
    ])("記号でつながった語が本文に無ければ、部分ごとに本文の書き方に合わせる：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it("インラインコードより文章の書き方を優先する", () => {
      expect(convertHeading("JSON OUTPUT", "Set `json` and `json` to print JSON output.")).toBe("JSON output")
    })

    it.each([
      ["語の中に大文字がある語", "USEEFFECT HOOK", "Call `useEffect` in a hook.", "useEffect hook"],
      ["コマンド名", "/CLAUDE-API HILLCLIMB", "Claude reads the API docs. Run `/claude-api hillclimb` to start.", "/claude-api hillclimb"],
    ])("文章に無い語はインラインコードの書き方に合わせる：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
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

    it.each([
      ["見出しの途中の語", "HABITS THAT PAY OFF", "Good habits are those that help.", "Habits that pay off"],
      ["見出しの最後の語", "KEEP IN MIND", "Keep this in view.", "Keep in mind"],
      ["見出しの最初の語", "FOUR HABITS WORTH KEEPING", "These habits are worth keeping.", "Four habits worth keeping"],
    ])("ほかの語が本文に出る見出しの、本文に無い短い語は小文字にする：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it.each([
      ["本文に無い", "SHOULD I USE TYPESCRIPT", "You should use TypeScript.", "Should I use TypeScript"],
      ["本文の変数に引きずられない", "WHEN I RETRY", "Set i to zero when you retry.", "When I retry"],
      ["短縮形", "WHEN I'VE FINISHED", "When you finished.", "When I've finished"],
    ])("一人称の I は大文字のまま残す：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it("本文に無い 1 文字の語は、ほかの語が本文に出ても残す", () => {
      expect(convertHeading("PATH B: CONNECT", "Take this path to connect.")).toBe("Path B: connect")
    })

    it.each([
      ["本文に無い短縮形", "WHY YOU DON'T NEED TESTS", "Why you need tests.", "Why you don't need tests"],
      ["引用符の種類が違う短縮形", "DON'T PANIC", "You don’t need to.", "Don’t panic"],
    ])("短縮形は略語として残さない：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it.each([
      ["所有格", "WHY CLAUDE'S MEMORY WORKS", "Why Claude has memory that works.", "Why Claude's memory works"],
      ["曲がった引用符の所有格", "GITHUB’S API", "GitHub has an API.", "GitHub’s API"],
      ["略語の複数形", "ABOUT SECURITY, APIS, AND DOCS", "About the security of the API and docs.", "About security, APIs, and docs"],
      ["一般の語の複数形", "REACT HOOKS", "React has a hook.", "React hooks"],
    ])("語の形が違っても本文の書き方に合わせる：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it.each([
      ["/ でつながった語の略語", "CI PIPELINES", "Run CI/CD pipelines.", "CI pipelines"],
      ["ハイフンでつながった語の略語", "API DESIGN", "An API-first design.", "API design"],
    ])("本文で記号でつながっている語の、大文字を含む部分も書き方に数える：%s", (_, heading, prose, expected) => {
      expect(convertHeading(heading, prose)).toBe(expected)
    })

    it("本文で記号でつながっている語の、小文字だけの部分は書き方に数えない", () => {
      expect(convertHeading("RFCS", "See vuejs/rfcs for details.")).toBe("RFCS")
    })

    it.each([
      ["Q&A SESSION", "Q&A session"],
      ["R&D TEAM", "R&D team"],
      ["A/B TESTING", "A/B testing"],
      ["TL;DR SUMMARY", "TL;DR summary"],
    ])("ほかの語が本文に出ても、記号でつながった短い語は残す：%s", (heading, expected) => {
      expect(convertHeading(heading, "The session summary covers team testing.")).toBe(expected)
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
