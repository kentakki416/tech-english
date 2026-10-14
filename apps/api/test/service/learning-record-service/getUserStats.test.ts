import { getUserStats } from "../../../src/service/learning-record-service"

import {
  buildSubmittedAttempt,
  buildUserGoal,
  createMockLearningRecordRepository,
  createMockUserGoalRepository,
  createMockUserRepository,
  FIXED_NOW,
  USER,
} from "./fixtures"

const setup = () => {
  const learningRecordRepository = createMockLearningRecordRepository()
  const userGoalRepository = createMockUserGoalRepository()
  const userRepository = createMockUserRepository()
  userRepository.findById.mockResolvedValue(USER)
  return { learningRecordRepository, userGoalRepository, userRepository }
}

/**
 * 2026-10-05（月）〜 2026-10-11（日）の週の日ごとの集計
 */
const buildWeekDay = (date: string, attemptCount: number, studySeconds: number) => ({
  attemptCount,
  correctCount: attemptCount * 3,
  date,
  questionCount: attemptCount * 4,
  studySeconds,
})

describe("getUserStats", () => {
  describe("正常系", () => {
    it("now = 2026-10-10T15:30:00Z・Asia/Tokyo のとき今日は 2026-10-11（日曜）で、週は 2026-10-05〜2026-10-11 で集計する", async () => {
      const repo = setup()

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.today).toBe("2026-10-11")
      }
      expect(repo.learningRecordRepository.summarizeByDate).toHaveBeenCalledWith(USER.id, { from: "2026-10-05", to: "2026-10-11" })
      expect(repo.learningRecordRepository.findSubmittedAttempts).toHaveBeenCalledWith(USER.id, { limit: 5 })
      expect(repo.userGoalRepository.findByUserId).toHaveBeenCalledWith(USER.id)
    })

    it("同じ時刻でも UTC のユーザーは今日が 2026-10-10（土曜）", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue({ ...USER, timezone: "UTC" })

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.today).toBe("2026-10-10")
      expect(repo.learningRecordRepository.summarizeByDate).toHaveBeenCalledWith(USER.id, { from: "2026-10-05", to: "2026-10-11" })
    })

    it("集計から連続学習日数・直近 14 日・目標の進捗・累計・種類別の正答率・最近の挑戦を組み立てる", async () => {
      const repo = setup()
      repo.learningRecordRepository.findStudyDates.mockResolvedValue([
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-10-01",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
      ])
      repo.learningRecordRepository.summarizeByDate.mockResolvedValue([
        buildWeekDay("2026-10-09", 1, 300),
        buildWeekDay("2026-10-10", 2, 600),
      ])
      repo.learningRecordRepository.summarizeTotals.mockResolvedValue({
        attemptCount: 63,
        correctCount: 197,
        passageCount: 48,
        questionCount: 252,
        studySeconds: 33_120,
      })
      repo.learningRecordRepository.summarizeNoAssistAccuracy.mockResolvedValue({ correctCount: 71, questionCount: 100 })
      repo.learningRecordRepository.summarizeAccuracyByQuestionType.mockResolvedValue([
        { correctCount: 43, questionCount: 50, type: "main_idea" },
        { correctCount: 31, questionCount: 50, type: "inference" },
      ])
      repo.learningRecordRepository.findSubmittedAttempts.mockResolvedValue([
        buildSubmittedAttempt({ id: 302, studyDate: "2026-10-11", submittedAt: new Date("2026-10-10T15:05:00.000Z"), wordLookupCount: 2 }),
        buildSubmittedAttempt({ id: 301 }),
      ])
      repo.userGoalRepository.findByUserId.mockResolvedValue(buildUserGoal())

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result).toEqual({
        ok: true,
        value: {
          goal: {
            daysLeft: 171,
            goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
            isWeeklyAchieved: false,
            targetDate: "2027-03-31",
            weeklyMetric: "passages",
            weeklyProgress: 3,
            weeklyTarget: 5,
          },
          noAssist: { accuracyPercent: 71, correctCount: 71, questionCount: 100 },
          recentAttempts: [
            {
              id: 302,
              correctCount: 3,
              elapsedSeconds: 312,
              isOvertime: false,
              passageId: 11,
              questionCount: 4,
              studyDate: "2026-10-11",
              submittedAt: new Date("2026-10-10T15:05:00.000Z"),
              submittedTime: "00:05",
              title: "Synchronizing with Effects",
              usedAssist: true,
            },
            {
              id: 301,
              correctCount: 3,
              elapsedSeconds: 312,
              isOvertime: false,
              passageId: 11,
              questionCount: 4,
              studyDate: "2026-10-10",
              submittedAt: new Date("2026-10-09T23:14:00.000Z"),
              submittedTime: "08:14",
              title: "Synchronizing with Effects",
              usedAssist: false,
            },
          ],
          streak: {
            current: 3,
            longest: 4,
            recentDays: [
              { date: "2026-09-28", hasStudied: false },
              { date: "2026-09-29", hasStudied: false },
              { date: "2026-09-30", hasStudied: false },
              { date: "2026-10-01", hasStudied: true },
              { date: "2026-10-02", hasStudied: false },
              { date: "2026-10-03", hasStudied: false },
              { date: "2026-10-04", hasStudied: false },
              { date: "2026-10-05", hasStudied: false },
              { date: "2026-10-06", hasStudied: false },
              { date: "2026-10-07", hasStudied: false },
              { date: "2026-10-08", hasStudied: false },
              { date: "2026-10-09", hasStudied: true },
              { date: "2026-10-10", hasStudied: true },
              { date: "2026-10-11", hasStudied: true },
            ],
          },
          today: "2026-10-11",
          totals: {
            accuracyPercent: 78,
            attemptCount: 63,
            correctCount: 197,
            passageCount: 48,
            questionCount: 252,
            studySeconds: 33_120,
          },
          typeAccuracy: [
            { accuracyPercent: 86, correctCount: 43, questionCount: 50, type: "main_idea" },
            { accuracyPercent: null, correctCount: 0, questionCount: 0, type: "detail" },
            { accuracyPercent: null, correctCount: 0, questionCount: 0, type: "vocabulary" },
            { accuracyPercent: 62, correctCount: 31, questionCount: 50, type: "inference" },
            { accuracyPercent: null, correctCount: 0, questionCount: 0, type: "purpose" },
          ],
          weakestQuestionType: "inference",
        },
      })
    })

    it("挑戦が 0 件なら累計 0・正答率 null・一番苦手な種類 null・連続日数 0・目標 null", async () => {
      const repo = setup()

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toMatchObject({
          goal: null,
          noAssist: { accuracyPercent: null, correctCount: 0, questionCount: 0 },
          recentAttempts: [],
          streak: { current: 0, longest: 0 },
          totals: { accuracyPercent: null, attemptCount: 0, correctCount: 0, passageCount: 0, questionCount: 0, studySeconds: 0 },
          weakestQuestionType: null,
        })
        expect(result.value.streak.recentDays).toHaveLength(14)
        expect(result.value.streak.recentDays.every((day) => !day.hasStudied)).toBe(true)
        expect(result.value.typeAccuracy.every((accuracy) => accuracy.accuracyPercent === null)).toBe(true)
      }
    })

    it.each([
      ["目標値ちょうど（3600 秒 = 60 分）は達成", [buildWeekDay("2026-10-05", 1, 1800), buildWeekDay("2026-10-11", 1, 1800)], 60, true],
      ["目標値の 1 秒前（3599 秒 = 59 分の切り捨て）は未達成", [buildWeekDay("2026-10-05", 1, 1800), buildWeekDay("2026-10-11", 1, 1799)], 59, false],
      ["目標値を超えても達成", [buildWeekDay("2026-10-06", 3, 5000)], 83, true],
      ["1 分未満（30 秒）は切り捨てて 0 分で未達成", [buildWeekDay("2026-10-11", 1, 30)], 0, false],
    ])("週の目標が minutes のとき、進捗は今週の秒の合計 ÷ 60 の切り捨て、達成は秒の合計が目標値 × 60 以上: %s", async (_label, weekDays, progress, achieved) => {
      const repo = setup()
      repo.learningRecordRepository.summarizeByDate.mockResolvedValue(weekDays)
      repo.userGoalRepository.findByUserId.mockResolvedValue(buildUserGoal({ weeklyMetric: "minutes", weeklyTarget: 60 }))

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.goal).toMatchObject({ isWeeklyAchieved: achieved, weeklyProgress: progress })
    })

    it.each([
      ["目標値の 1 問前は未達成", 4, false],
      ["目標値ちょうどは達成", 5, true],
    ])("週の目標が passages のとき、進捗は今週の提出数: %s", async (_label, attemptCount, achieved) => {
      const repo = setup()
      repo.learningRecordRepository.summarizeByDate.mockResolvedValue([
        buildWeekDay("2026-10-05", attemptCount - 1, 600),
        buildWeekDay("2026-10-11", 1, 60),
      ])
      repo.userGoalRepository.findByUserId.mockResolvedValue(buildUserGoal({ weeklyMetric: "passages", weeklyTarget: 5 }))

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.goal).toMatchObject({ isWeeklyAchieved: achieved, weeklyProgress: attemptCount })
    })

    it("週の目標が無ければ進捗は null で未達成。目標日が無ければ残り日数は null", async () => {
      const repo = setup()
      repo.learningRecordRepository.summarizeByDate.mockResolvedValue([buildWeekDay("2026-10-06", 3, 900)])
      repo.userGoalRepository.findByUserId.mockResolvedValue(
        buildUserGoal({ goalText: "続ける", targetDate: null, weeklyMetric: null, weeklyTarget: null }),
      )

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.goal).toEqual({
        daysLeft: null,
        goalText: "続ける",
        isWeeklyAchieved: false,
        targetDate: null,
        weeklyMetric: null,
        weeklyProgress: null,
        weeklyTarget: null,
      })
    })

    it.each([
      ["今日なら 0", "2026-10-11", 0],
      ["明日なら 1", "2026-10-12", 1],
      ["過ぎていれば負", "2026-10-01", -10],
    ])("残り日数は目標日 − 今日: %s", async (_label, targetDate, daysLeft) => {
      const repo = setup()
      repo.userGoalRepository.findByUserId.mockResolvedValue(buildUserGoal({ targetDate }))

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.goal?.daysLeft).toBe(daysLeft)
    })

    it("一番苦手な種類は丸める前の比で比べる（丸めると同じ 67% でも 2/3 < 0.67）", async () => {
      const repo = setup()
      repo.learningRecordRepository.summarizeAccuracyByQuestionType.mockResolvedValue([
        { correctCount: 67, questionCount: 100, type: "main_idea" },
        { correctCount: 2, questionCount: 3, type: "purpose" },
      ])

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.typeAccuracy.map((accuracy) => accuracy.accuracyPercent)).toEqual([67, null, null, null, 67])
        expect(result.value.weakestQuestionType).toBe("purpose")
      }
    })

    it("一番低い比の種類が複数あれば（他に高い種類があるとき）、QUESTION_TYPES の順で先の種類を一番苦手とする", async () => {
      const repo = setup()
      repo.learningRecordRepository.summarizeAccuracyByQuestionType.mockResolvedValue([
        { correctCount: 1, questionCount: 2, type: "purpose" },
        { correctCount: 2, questionCount: 4, type: "vocabulary" },
        { correctCount: 3, questionCount: 3, type: "detail" },
      ])

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.weakestQuestionType).toBe("vocabulary")
    })

    it.each([
      [
        "設問のある種類がすべて 100%（初めての 1 問を全問正解）",
        [
          { correctCount: 2, questionCount: 2, type: "main_idea" },
          { correctCount: 1, questionCount: 1, type: "detail" },
          { correctCount: 1, questionCount: 1, type: "inference" },
        ],
      ],
      ["設問のある種類が 1 つだけ", [{ correctCount: 1, questionCount: 4, type: "main_idea" }]],
      [
        "設問のある種類がすべて同率（100% 未満）",
        [
          { correctCount: 1, questionCount: 2, type: "main_idea" },
          { correctCount: 2, questionCount: 4, type: "vocabulary" },
          { correctCount: 3, questionCount: 6, type: "purpose" },
        ],
      ],
    ] as const)("他の種類より低いと言えないので一番苦手な種類は null: %s", async (_label, counts) => {
      const repo = setup()
      repo.learningRecordRepository.summarizeAccuracyByQuestionType.mockResolvedValue([...counts])

      const result = await getUserStats(USER.id, repo, { now: FIXED_NOW })

      expect(result.ok && result.value.weakestQuestionType).toBeNull()
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しなければ UNAUTHORIZED（401）で、集計を読まない", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await getUserStats(999, repo, { now: FIXED_NOW })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(repo.learningRecordRepository.findStudyDates).not.toHaveBeenCalled()
      expect(repo.userGoalRepository.findByUserId).not.toHaveBeenCalled()
    })

    it("データベースエラー時に例外が伝播する", async () => {
      const repo = setup()
      repo.learningRecordRepository.summarizeTotals.mockRejectedValue(new Error("Database connection failed"))

      await expect(getUserStats(USER.id, repo, { now: FIXED_NOW })).rejects.toThrow()
    })
  })
})
