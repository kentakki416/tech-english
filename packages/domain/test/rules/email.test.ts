import { normalizeEmail } from "../../src/rules/email"

describe("normalizeEmail", () => {
  describe("正常系", () => {
    it("大文字を小文字にそろえる", () => {
      expect(normalizeEmail("Someone@Example.COM")).toBe("someone@example.com")
    })

    it("前後の空白を除く", () => {
      expect(normalizeEmail(" \tsomeone@example.com\n")).toBe("someone@example.com")
    })

    it("そろえ済みの email はそのまま返す", () => {
      expect(normalizeEmail("someone@example.com")).toBe("someone@example.com")
    })
  })

  describe("異常系", () => {
    it("空白だけの文字列は空文字になる（email の形かどうかは呼び出し側で確かめる）", () => {
      expect(normalizeEmail("   ")).toBe("")
    })
  })
})
