import type { PassageBlock } from "@repo/domain"

import { countEnglishWords, findRejectReasons, forTesting } from "../../src/document/passage-rules"

import { buildParagraph, buildWords } from "./helpers"

const { calculateCodeLineRatio, calculateEnglishLetterRatio, calculateProseWordRatio } = forTesting

const buildCode = (lineCount: number): PassageBlock => ({
  lang: "ts",
  text: Array.from({ length: lineCount }, (_, index) => `const value${index} = ${index}`).join("\n"),
  type: "code",
})

const buildListItem = (wordCount: number): PassageBlock => ({ text: buildWords(wordCount), type: "list_item" })

describe("passage-rules", () => {
  describe("正常系", () => {
    it("countEnglishWords はコードブロック・インラインコード・記号だけのトークンを数えない", () => {
      const blocks: PassageBlock[] = [
        { text: "Call `useState` here --- !! 42 a-b", type: "paragraph" },
        { text: "Run `npm run build` to build", type: "list_item" },
        { lang: "js", text: "const words = \"many words in code\"", type: "code" },
      ]

      /**
       * Call / here / 42 / a-b + Run / to / build
       */
      expect(countEnglishWords(blocks)).toBe(7)
    })

    it("calculateCodeLineRatio はコードの行数と、80 文字を 1 行とみなした文章の行数で割合を出す", () => {
      const blocks: PassageBlock[] = [
        { text: "a\nb\nc", type: "code" },
        { text: "x".repeat(81), type: "paragraph" },
      ]

      expect(calculateCodeLineRatio(blocks)).toBe(3 / 5)
      expect(calculateCodeLineRatio([])).toBe(0)
    })

    it("calculateEnglishLetterRatio はコードとインラインコードを除いた文字に占める ASCII 英字の割合を出す", () => {
      expect(calculateEnglishLetterRatio([{ text: "abc あ", type: "paragraph" }])).toBe(0.75)
      expect(calculateEnglishLetterRatio([
        { text: "abc `日本語`", type: "paragraph" },
        { text: "日本語のコメント", type: "code" },
      ])).toBe(1)
      expect(calculateEnglishLetterRatio([{ text: "123 !!", type: "paragraph" }])).toBe(0)
    })

    it("calculateProseWordRatio は paragraph と quote の英単語数の割合を出す", () => {
      const blocks: PassageBlock[] = [
        { text: "one two three", type: "paragraph" },
        { text: "four", type: "quote" },
        { text: "five six seven eight", type: "list_item" },
      ]

      expect(calculateProseWordRatio(blocks)).toBe(0.5)
      expect(calculateProseWordRatio([])).toBe(0)
    })

    it("calculateProseWordRatio は 12 語以上の list_item を文章に数え、11 語の list_item は数えない", () => {
      expect(calculateProseWordRatio([buildParagraph(12), buildListItem(12)])).toBe(1)
      expect(calculateProseWordRatio([buildParagraph(11), buildListItem(11)])).toBe(0.5)
    })

    it.each([
      ["200 語", [buildParagraph(200)]],
      ["600 語", [buildParagraph(600)]],
      /**
       * 240 語は 1,199 文字で文章 15 行。コード 10 行で 10 / 25 = 40%
       */
      ["コード 40%", [buildParagraph(240), buildCode(10)]],
      /**
       * 225 語で ASCII 英字 900 文字。かな 100 文字で 900 / 1,000 = 90%
       */
      ["英字 90%", [buildParagraph(225), { text: "あ".repeat(100), type: "paragraph" }]],
      /**
       * 11 語の項目は文章に数えないので 154 / 308 = 50%
       */
      ["文章 50%", [buildParagraph(154), ...Array.from({ length: 14 }, () => buildListItem(11))]],
      ["12 語の項目が並ぶ塊", [buildParagraph(150), ...Array.from({ length: 14 }, () => buildListItem(12))]],
    ] satisfies [string, PassageBlock[]][])("境界値：%s は本文候補になる", (_, blocks) => {
      expect(findRejectReasons(blocks)).toEqual([])
    })
  })

  describe("異常系", () => {
    it.each([
      ["199 語は too_short", [buildParagraph(199)], ["too_short"]],
      ["601 語（1 段落）は too_long", [buildParagraph(601)], ["too_long"]],
      ["コード 11 行（11 / 26）は too_much_code", [buildParagraph(240), buildCode(11)], ["too_much_code"]],
      ["コード主体は too_much_code", [buildParagraph(200), buildCode(30)], ["too_much_code"]],
      [
        "かな 101 文字（900 / 1,001）は not_english",
        [buildParagraph(225), { text: "あ".repeat(101), type: "paragraph" }],
        ["not_english"],
      ],
      [
        "文章 150 / 304 語（11 語の項目 14 個）は not_prose",
        [buildParagraph(150), ...Array.from({ length: 14 }, () => buildListItem(11))],
        ["not_prose"],
      ],
      [
        "リンク集のリストだけの塊は not_prose",
        Array.from({ length: 50 }, () => buildListItem(5)),
        ["not_prose"],
      ],
      ["空の塊はすべての条件を満たさない", [], ["too_short", "not_english", "not_prose"]],
    ] satisfies [string, PassageBlock[], string[]][])("%s", (_, blocks, expected) => {
      expect(findRejectReasons(blocks)).toEqual(expected)
    })

    it("日本語の文書は not_english", () => {
      const blocks: PassageBlock[] = [
        { text: "この章では React の useState を使って状態を管理する方法を説明します。".repeat(20), type: "paragraph" },
      ]

      expect(findRejectReasons(blocks)).toContain("not_english")
    })
  })
})
