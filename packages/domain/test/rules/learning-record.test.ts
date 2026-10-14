import {
  addDaysToDate,
  calculateStreak,
  convertStudySecondsToLevel,
  countDaysBetween,
  getWeekRange,
} from "../../src/rules/learning-record"

describe("convertStudySecondsToLevel", () => {
  describe("正常系", () => {
    /**
     * 0 / 〜5 分 / 〜15 分 / 〜30 分 / 30 分超 の境界の両側（上限ちょうどは下の段階）
     */
    it.each([
      [0, 0],
      [1, 1],
      [300, 1],
      [301, 2],
      [900, 2],
      [901, 3],
      [1800, 3],
      [1801, 4],
      [36_000, 4],
    ])("%d 秒は段階 %d", (seconds, expected) => {
      expect(convertStudySecondsToLevel(seconds)).toBe(expected)
    })
  })

  describe("異常系", () => {
    it("負の秒数は段階 0", () => {
      expect(convertStudySecondsToLevel(-1)).toBe(0)
    })
  })
})

describe("calculateStreak", () => {
  const TODAY = "2026-10-11"

  describe("正常系", () => {
    it("今日だけ学習していれば現在 1・最長 1", () => {
      expect(calculateStreak(["2026-10-11"], TODAY)).toEqual({ current: 1, longest: 1 })
    })

    it("昨日だけ学習していれば、今日まだ学習していなくても現在 1（途切れない）", () => {
      expect(calculateStreak(["2026-10-10"], TODAY)).toEqual({ current: 1, longest: 1 })
    })

    it("一昨日まで続いていて昨日・今日が空いていれば現在 0。最長は残る", () => {
      expect(calculateStreak(["2026-10-07", "2026-10-08", "2026-10-09"], TODAY)).toEqual({ current: 0, longest: 3 })
    })

    it("今日・昨日・一昨日なら 3", () => {
      expect(calculateStreak(["2026-10-09", "2026-10-10", "2026-10-11"], TODAY)).toEqual({ current: 3, longest: 3 })
    })

    it("間に 1 日の空きがあると、空きの後から数え直す", () => {
      expect(calculateStreak(["2026-10-06", "2026-10-07", "2026-10-09", "2026-10-10", "2026-10-11"], TODAY)).toEqual({
        current: 3,
        longest: 3,
      })
    })

    it("過去の最長（5 日）が現在（2 日）より長ければ最長 5・現在 2", () => {
      const pastRun = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]

      expect(calculateStreak([...pastRun, "2026-10-10", "2026-10-11"], TODAY)).toEqual({ current: 2, longest: 5 })
    })

    it("重複した日付・ばらばらの並び順でも、整列した入力と同じ結果になる", () => {
      const sorted = ["2026-09-01", "2026-09-02", "2026-10-09", "2026-10-10", "2026-10-11"]
      const shuffled = ["2026-10-10", "2026-09-02", "2026-10-11", "2026-10-10", "2026-09-01", "2026-10-09", "2026-09-02"]

      expect(calculateStreak(shuffled, TODAY)).toEqual(calculateStreak(sorted, TODAY))
      expect(calculateStreak(shuffled, TODAY)).toEqual({ current: 3, longest: 3 })
    })

    it.each([
      ["月またぎ", ["2026-10-31", "2026-11-01"], "2026-11-01"],
      ["年またぎ", ["2026-12-31", "2027-01-01"], "2027-01-01"],
    ])("%s でも連続と数える", (_label, dates, today) => {
      expect(calculateStreak(dates, today)).toEqual({ current: 2, longest: 2 })
    })

    it("うるう日（2028-02-28 → 02-29 → 03-01）を挟んでも連続と数える", () => {
      expect(calculateStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01")).toEqual({ current: 3, longest: 3 })
    })

    it("うるう年でない年は 02-28 の翌日が 03-01 なので連続と数える", () => {
      expect(calculateStreak(["2027-02-28", "2027-03-01"], "2027-03-01")).toEqual({ current: 2, longest: 2 })
    })

    it("今日より後の日付だけがある（タイムゾーンを西に変えた直後）なら現在は途切れない", () => {
      expect(calculateStreak(["2026-10-12"], TODAY)).toEqual({ current: 1, longest: 1 })
    })

    it("昨日・今日・明日（タイムゾーン変更直後）は 3 日続いている", () => {
      expect(calculateStreak(["2026-10-10", "2026-10-11", "2026-10-12"], TODAY)).toEqual({ current: 3, longest: 3 })
    })
  })

  describe("異常系", () => {
    it("学習した日が無ければ現在 0・最長 0", () => {
      expect(calculateStreak([], TODAY)).toEqual({ current: 0, longest: 0 })
    })

    it("一昨日だけ（境界値: 昨日の前日）なら現在 0", () => {
      expect(calculateStreak(["2026-10-09"], TODAY)).toEqual({ current: 0, longest: 1 })
    })
  })
})

describe("getWeekRange", () => {
  describe("正常系", () => {
    it.each([
      ["月曜", "2026-10-05", { end: "2026-10-11", start: "2026-10-05" }],
      ["土曜", "2026-10-10", { end: "2026-10-11", start: "2026-10-05" }],
      ["日曜（週の最終日）", "2026-10-11", { end: "2026-10-11", start: "2026-10-05" }],
      ["翌週の月曜（境界値）", "2026-10-12", { end: "2026-10-18", start: "2026-10-12" }],
      ["年またぎ（2027-01-01 は金曜）", "2027-01-01", { end: "2027-01-03", start: "2026-12-28" }],
      ["うるう日を含む週（2028-02-29 は火曜）", "2028-02-29", { end: "2028-03-05", start: "2028-02-28" }],
    ])("%s（%s）を含む週", (_label, today, expected) => {
      expect(getWeekRange(today)).toEqual(expected)
    })
  })
})

describe("addDaysToDate", () => {
  describe("正常系", () => {
    it.each([
      ["同じ日", "2026-10-11", 0, "2026-10-11"],
      ["月末の翌日", "2026-10-31", 1, "2026-11-01"],
      ["うるう年の 2 月末の翌日", "2028-02-28", 1, "2028-02-29"],
      ["うるう日の翌日", "2028-02-29", 1, "2028-03-01"],
      ["うるう年でない 2 月末の翌日", "2027-02-28", 1, "2027-03-01"],
      ["年末の翌日", "2026-12-31", 1, "2027-01-01"],
      ["負の日数で年始から前年へ", "2027-01-01", -1, "2026-12-31"],
      ["負の日数でうるう日をまたぐ", "2028-03-01", -2, "2028-02-28"],
      ["365 日前", "2026-10-11", -365, "2025-10-11"],
    ])("%s: %s + %d 日 = %s", (_label, date, days, expected) => {
      expect(addDaysToDate(date, days)).toBe(expected)
    })
  })
})

describe("countDaysBetween", () => {
  describe("正常系", () => {
    it.each([
      ["同じ日", "2026-10-11", "2026-10-11", 0],
      ["翌日", "2026-10-11", "2026-10-12", 1],
      ["うるう年の 2 月をまたぐ", "2028-02-28", "2028-03-01", 2],
      ["うるう年でない 2 月をまたぐ", "2027-02-28", "2027-03-01", 1],
      ["年またぎ", "2026-12-31", "2027-01-01", 1],
      ["うるう年の 1 年", "2028-01-01", "2029-01-01", 366],
      ["to が前なら負", "2026-10-11", "2026-10-01", -10],
    ])("%s: %s → %s は %d 日", (_label, from, to, expected) => {
      expect(countDaysBetween(from, to)).toBe(expected)
    })
  })
})
