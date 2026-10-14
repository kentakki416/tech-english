import { calculateWordsPerMinute, clampElapsedSeconds, gradeAnswers, hasAnswerKeyChanged, isOvertime } from "../../src/lib/grade-attempt"

const STARTED_AT = new Date("2026-10-12T10:00:00.000Z")

/**
 * STARTED_AT から 300 秒後（壁時計 = 300 秒）
 */
const NOW = new Date("2026-10-12T10:05:00.000Z")

describe("clampElapsedSeconds", () => {
  describe("正常系", () => {
    it.each([
      ["申告が壁時計より大きければ壁時計に切り詰める", 301, NOW, 300],
      ["申告が壁時計と同じならそのまま（境界値）", 300, NOW, 300],
      ["申告が壁時計より小さければ申告のまま", 299, NOW, 299],
      ["申告が 0 なら 0", 0, NOW, 0],
      ["壁時計は秒未満を切り捨てる（300.999 秒 → 300）", 9999, new Date("2026-10-12T10:05:00.999Z"), 300],
      ["開始が未来（時計のずれ）なら 0", 120, new Date("2026-10-12T09:59:59.000Z"), 0],
    ])("%s", (_label, activeSeconds, now, expected) => {
      expect(clampElapsedSeconds(activeSeconds, STARTED_AT, now)).toBe(expected)
    })
  })
})

describe("isOvertime", () => {
  describe("正常系", () => {
    it.each([
      ["制限時間より短ければ false", 179, false],
      ["制限時間ちょうどは超過ではない（境界値）", 180, false],
      ["制限時間を 1 秒超えたら true（境界値）", 181, true],
    ])("%s", (_label, elapsedSeconds, expected) => {
      expect(isOvertime(elapsedSeconds, 180)).toBe(expected)
    })
  })
})

describe("gradeAnswers", () => {
  const QUESTIONS = [
    { id: 201, correctChoiceIndex: 1 },
    { id: 202, correctChoiceIndex: 2 },
    { id: 203, correctChoiceIndex: 0 },
    { id: 204, correctChoiceIndex: 3 },
  ]

  describe("正常系", () => {
    it("全設問を設問の順に採点する。null・回答が無い設問は不正解で、正答数を数える", () => {
      const result = gradeAnswers(QUESTIONS, [
        { questionId: 204, selectedChoiceIndex: 3 },
        { questionId: 202, selectedChoiceIndex: 1 },
        { questionId: 201, selectedChoiceIndex: 1 },
        { questionId: 203, selectedChoiceIndex: null },
      ])

      expect(result).toEqual({
        answers: [
          { isCorrect: true, questionId: 201, selectedChoiceIndex: 1 },
          { isCorrect: false, questionId: 202, selectedChoiceIndex: 1 },
          { isCorrect: false, questionId: 203, selectedChoiceIndex: null },
          { isCorrect: true, questionId: 204, selectedChoiceIndex: 3 },
        ],
        correctCount: 2,
      })
    })

    it("回答が 1 つも無ければ全設問が未回答の不正解で、正答数は 0", () => {
      const result = gradeAnswers(QUESTIONS, [])

      expect(result).toEqual({
        answers: QUESTIONS.map((question) => ({ isCorrect: false, questionId: question.id, selectedChoiceIndex: null })),
        correctCount: 0,
      })
    })

    it("設問に無い questionId の回答は無視する", () => {
      const result = gradeAnswers(QUESTIONS.slice(0, 1), [{ questionId: 999, selectedChoiceIndex: 1 }])

      expect(result).toEqual({ answers: [{ isCorrect: false, questionId: 201, selectedChoiceIndex: null }], correctCount: 0 })
    })
  })
})

describe("hasAnswerKeyChanged", () => {
  describe("正常系", () => {
    it.each([
      ["正解（1）を選んで正解のまま、いまの正解も 1 なら false", { isCorrect: true, selectedChoiceIndex: 1 }, 1, false],
      ["0 を選んで不正解のまま、いまの正解も 1 なら false", { isCorrect: false, selectedChoiceIndex: 0 }, 1, false],
      ["0 を選んで不正解だったが、いまの正解が 0 に直されていれば true", { isCorrect: false, selectedChoiceIndex: 0 }, 0, true],
      ["1 を選んで正解だったが、いまの正解が 2 に直されていれば true", { isCorrect: true, selectedChoiceIndex: 1 }, 2, true],
      ["0 を選んで不正解で、正解が 1 から 2 に直されても不正解のままなので false", { isCorrect: false, selectedChoiceIndex: 0 }, 2, false],
      ["未回答はいまの正解でも不正解なので false", { isCorrect: false, selectedChoiceIndex: null }, 1, false],
    ])("%s", (_label, storedAnswer, correctChoiceIndex, expected) => {
      expect(hasAnswerKeyChanged(storedAnswer, correctChoiceIndex)).toBe(expected)
    })
  })
})

describe("calculateWordsPerMinute", () => {
  describe("正常系", () => {
    it.each([
      ["英単語数 ÷ かかった分", 300, 150, 120],
      ["四捨五入する（60 語 ÷ 56 秒 = 64.28… → 64）", 60, 56, 64],
      ["四捨五入する（100 語 ÷ 80 秒 = 75）", 100, 80, 75],
      ["四捨五入する（5 語 ÷ 8 秒 = 37.5 → 38）", 5, 8, 38],
      ["かかった時間が 0 秒なら null（境界値）", 300, 0, null],
    ])("%s", (_label, wordCount, elapsedSeconds, expected) => {
      expect(calculateWordsPerMinute(wordCount, elapsedSeconds)).toBe(expected)
    })
  })
})
