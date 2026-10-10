import { isAdminTokenValid } from "../../src/lib/admin-token"

const EXPECTED = "0123456789abcdef0123456789abcdef"

describe("isAdminTokenValid", () => {
  describe("正常系", () => {
    it("期待値と一致すれば true を返す", () => {
      expect(isAdminTokenValid(EXPECTED, EXPECTED)).toBe(true)
    })
  })

  describe("異常系", () => {
    it("末尾の 1 文字だけ違えば false を返す（境界値）", () => {
      expect(isAdminTokenValid(`${EXPECTED.slice(0, -1)}0`, EXPECTED)).toBe(false)
    })

    it("先頭の 1 文字だけ違えば false を返す（境界値）", () => {
      expect(isAdminTokenValid(`f${EXPECTED.slice(1)}`, EXPECTED)).toBe(false)
    })

    it("1 文字短ければ throw せずに false を返す（境界値）", () => {
      expect(isAdminTokenValid(EXPECTED.slice(0, -1), EXPECTED)).toBe(false)
    })

    it("1 文字長ければ throw せずに false を返す（境界値）", () => {
      expect(isAdminTokenValid(`${EXPECTED}0`, EXPECTED)).toBe(false)
    })

    it("空文字なら false を返す", () => {
      expect(isAdminTokenValid("", EXPECTED)).toBe(false)
    })

    it("undefined なら false を返す", () => {
      expect(isAdminTokenValid(undefined, EXPECTED)).toBe(false)
    })
  })
})
