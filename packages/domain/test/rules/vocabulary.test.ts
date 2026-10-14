import { VOCABULARY_MASTERED_STAGE, VOCABULARY_REVIEW_INTERVAL_DAYS } from "../../src/const/vocabulary"
import { isVocabularyGrade, normalizeVocabularyLemma, scheduleVocabularyReview } from "../../src/rules/vocabulary"

describe("scheduleVocabularyReview", () => {
  const TODAY = "2026-10-14"

  describe("正常系", () => {
    /**
     * 新しい単語（null）と段階 0〜3 の「覚えた」。3 日後 → 7 日後 → 30 日後 → 覚えた単語
     */
    it.each([
      [null, 1, "2026-10-17"],
      [0, 1, "2026-10-17"],
      [1, 2, "2026-10-21"],
      [2, 3, "2026-11-13"],
      [3, 4, null],
    ])("段階 %s で覚えたなら段階 %d・次は %s", (stageBefore, stage, dueDate) => {
      expect(scheduleVocabularyReview(stageBefore, "remembered", TODAY)).toEqual({ dueDate, stage })
    })

    it.each([null, 0, 1, 2, 3])("段階 %s でまだなら段階 0・翌日", (stageBefore) => {
      expect(scheduleVocabularyReview(stageBefore, "forgot", TODAY)).toEqual({ dueDate: "2026-10-15", stage: 0 })
    })

    it("年をまたいでも日付で数える", () => {
      expect(scheduleVocabularyReview(2, "remembered", "2026-12-15")).toEqual({ dueDate: "2027-01-14", stage: 3 })
    })
  })

  describe("異常系", () => {
    it("覚えた単語（段階 4）で覚えたなら段階 4 のまま", () => {
      expect(scheduleVocabularyReview(4, "remembered", TODAY)).toEqual({ dueDate: null, stage: 4 })
    })

    it("覚えた単語（段階 4）でまだなら段階 0 に戻る", () => {
      expect(scheduleVocabularyReview(4, "forgot", TODAY)).toEqual({ dueDate: "2026-10-15", stage: 0 })
    })
  })

  it("覚えた単語の段階は間隔の数と同じ（片方だけ変えていない）", () => {
    expect(VOCABULARY_MASTERED_STAGE).toBe(VOCABULARY_REVIEW_INTERVAL_DAYS.length)
  })
})

describe("normalizeVocabularyLemma", () => {
  it.each([
    ["Effect", "effect"],
    ["  opt out of ", "opt out of"],
    ["re-render", "re-render"],
  ])("%j は %j", (lemma, expected) => {
    expect(normalizeVocabularyLemma(lemma)).toBe(expected)
  })
})

describe("isVocabularyGrade", () => {
  it.each([
    ["remembered", true],
    ["forgot", true],
    ["skip", false],
    ["", false],
  ])("%j は %s", (value, expected) => {
    expect(isVocabularyGrade(value)).toBe(expected)
  })
})
