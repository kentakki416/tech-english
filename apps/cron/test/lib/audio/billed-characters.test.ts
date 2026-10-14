import type { PassageBlock } from "@repo/domain"

import { estimateBilledCharacters, getBillingMonthStart } from "../../../src/lib/audio"

describe("estimateBilledCharacters", () => {
  describe("正常系", () => {
    it("読み上げるブロックの読み上げ用テキスト（バッククォートを除く）の文字数 × 2。code のブロックは数えない", () => {
      const blocks: PassageBlock[] = [
        { text: "Effects", type: "heading" },
        { text: "Use `useEffect` here.", type: "paragraph" },
        { lang: "js", text: "useEffect(() => {})", type: "code" },
      ]

      /**
       * "Effects"（7）+ "Use useEffect here."（19）
       */
      expect(estimateBilledCharacters(blocks)).toBe((7 + 19) * 2)
    })

    it("3,000 文字を超えるブロックはパートに分けた文字数（パートの境目の空白は送らないので数えない）", () => {
      const sentence = "Sentence explains retries."
      const text = Array.from({ length: 120 }, () => sentence).join(" ")

      const estimated = estimateBilledCharacters([{ text, type: "paragraph" }])

      expect(text.length).toBeGreaterThan(3000)
      expect(estimated).toBe((text.length - 1) * 2)
    })
  })

  describe("異常系", () => {
    it("読み上げるブロックが無ければ 0", () => {
      expect(estimateBilledCharacters([{ lang: "sh", text: "npm install", type: "code" }])).toBe(0)
    })
  })
})

describe("getBillingMonthStart", () => {
  describe("正常系", () => {
    it("UTC の暦月の初め（日本時間の月初めの 9 時間前までは前の月）", () => {
      expect(getBillingMonthStart(new Date("2026-10-14T03:00:00.000Z"))).toEqual(new Date("2026-10-01T00:00:00.000Z"))
      expect(getBillingMonthStart(new Date("2026-10-31T23:59:59.999Z"))).toEqual(new Date("2026-10-01T00:00:00.000Z"))
      expect(getBillingMonthStart(new Date("2026-11-01T00:00:00.000Z"))).toEqual(new Date("2026-11-01T00:00:00.000Z"))
    })
  })
})
