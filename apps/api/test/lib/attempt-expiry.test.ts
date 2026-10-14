import { calculateAliveSince, calculateExpiresAt, isAttemptExpired } from "../../src/lib/attempt-expiry"

const STARTED_AT = new Date("2026-10-12T00:00:00.000Z")

describe("calculateExpiresAt", () => {
  describe("正常系", () => {
    it("開始の 24 時間後を返す", () => {
      expect(calculateExpiresAt(STARTED_AT)).toEqual(new Date("2026-10-13T00:00:00.000Z"))
    })
  })
})

describe("calculateAliveSince", () => {
  describe("正常系", () => {
    it("現在の 24 時間前を返す", () => {
      expect(calculateAliveSince(new Date("2026-10-13T12:34:56.789Z"))).toEqual(new Date("2026-10-12T12:34:56.789Z"))
    })
  })
})

describe("isAttemptExpired", () => {
  describe("正常系", () => {
    it.each([
      ["開始直後", "2026-10-12T00:00:00.000Z", false],
      ["開始から 23:59:59.999（境界値）", "2026-10-12T23:59:59.999Z", false],
      ["開始からちょうど 24 時間（境界値）", "2026-10-13T00:00:00.000Z", true],
      ["開始から 24 時間より後", "2026-10-14T00:00:00.000Z", true],
    ])("%sは %s", (_label, now, expected) => {
      expect(isAttemptExpired(STARTED_AT, new Date(now))).toBe(expected)
    })
  })
})
