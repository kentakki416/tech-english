import { attemptAnswers, users } from "@repo/db"

import { DrizzleAdminStatsRepository } from "../../src/repository/drizzle/admin-stats-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { createSubmittedAttempt } from "../fixture/learning-record"
import { insertAttemptUser, insertGeneratedPassage, insertReadingAttempt } from "../fixture/passage"
import { insertVocabularyCard, insertVocabularyReview } from "../fixture/vocabulary"

const adminStatsRepository = new DrizzleAdminStatsRepository(testDb)

const at = (iso: string): Date => new Date(iso)

/**
 * 期間の始まり（日本時間 2026-10-09 0:00）と終わり（今。日本時間 2026-10-15 12:00）
 */
const RANGE = { from: at("2026-10-08T15:00:00.000Z"), to: at("2026-10-15T03:00:00.000Z") }

/**
 * 設問 3 問（test/fixture/passage-content.ts の QUESTION_ITEMS。Q1 の正解は 1、Q2 は 2）つきの問題
 */
const insertPassageWithQuestions = async (overrides: Parameters<typeof insertGeneratedPassage>[0] = {}) => {
  const generated = await insertGeneratedPassage({ publishedAt: at("2026-10-01T03:00:00.000Z"), status: "published", ...overrides })
  return { id: generated.passage.id, questionIds: generated.questions.map((question) => question.id), sourceId: generated.source.id }
}

/**
 * 登録日時を決めてユーザーを入れる
 */
const insertUserCreatedAt = async (createdAt: Date) => {
  const [user] = await testDb.insert(users).values({ createdAt, email: `stats-${createdAt.getTime()}-${Math.random()}@example.com`, name: "Stats User" }).returning()
  return user
}

const submit = async (
  passage: { id: number; questionIds: number[] },
  userId: number,
  submittedAt: Date,
  overrides: Partial<Parameters<typeof createSubmittedAttempt>[0]> = {},
) =>
  createSubmittedAttempt({
    passageId: passage.id,
    questionIds: passage.questionIds,
    studyDate: submittedAt.toISOString().slice(0, 10),
    submittedAt,
    userId,
    ...overrides,
  })

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("AdminStatsRepository", () => {
  describe("summarizeOverview", () => {
    describe("正常系", () => {
      it("期間内の提出だけを数え、同じ人の 2 回は解いた回数 2・解いた人数 1 になる", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        await submit(passage, user.id, RANGE.from, { correctness: [true, false, true], elapsedSeconds: 100, translatedBlockCount: 1 })
        await submit(passage, user.id, at("2026-10-12T00:00:00.000Z"), {
          elapsedSeconds: 200,
          isOvertime: true,
          translatedQuestionCount: 2,
          wordLookupCount: 2,
        })
        await submit(passage, otherUser.id, at("2026-10-14T00:00:00.000Z"), { elapsedSeconds: 300, listenedBlockCount: 3 })

        expect(await adminStatsRepository.summarizeOverview(RANGE)).toMatchObject({
          correctCount: 8,
          elapsedSecondsSum: 600,
          listenedAttempts: 1,
          lookedUpAttempts: 1,
          overtimeAttempts: 1,
          questionCount: 9,
          solvedAttempts: 3,
          solvedUsers: 2,
          translatedAttempts: 1,
          translatedQuestionAttempts: 1,
        })
      })

      it("学習したユーザーは問題だけ・単語帳だけ・両方の人をそれぞれ 1 人に数え、新規登録は期間内の登録だけ、総数は全員", async () => {
        const passage = await insertPassageWithQuestions()
        const solverOnly = await insertUserCreatedAt(at("2026-09-01T00:00:00.000Z"))
        const reviewerOnly = await insertUserCreatedAt(at("2026-10-10T00:00:00.000Z"))
        const both = await insertUserCreatedAt(at("2026-10-11T00:00:00.000Z"))
        await insertUserCreatedAt(at("2026-08-01T00:00:00.000Z"))
        await submit(passage, solverOnly.id, at("2026-10-12T00:00:00.000Z"))
        await submit(passage, both.id, at("2026-10-12T00:00:00.000Z"))
        const reviewerCard = await insertVocabularyCard(reviewerOnly.id, { lemma: "effect" })
        await insertVocabularyReview(reviewerOnly.id, reviewerCard.id, { createdAt: at("2026-10-13T00:00:00.000Z") })
        const bothCard = await insertVocabularyCard(both.id, { lemma: "effect" })
        await insertVocabularyReview(both.id, bothCard.id, { createdAt: at("2026-10-13T00:00:00.000Z") })

        expect(await adminStatsRepository.summarizeOverview(RANGE)).toMatchObject({ activeUsers: 3, newUsers: 2, totalUsers: 4 })
      })

      it("from が null（全期間）なら下限なしで数える", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await submit(passage, user.id, at("2026-01-01T00:00:00.000Z"))

        expect(await adminStatsRepository.summarizeOverview({ from: null, to: RANGE.to })).toMatchObject({ solvedAttempts: 1 })
      })
    })

    describe("異常系", () => {
      it("期間の境界：from ちょうどは入り、to ちょうど・from の直前は入らない。挑戦中・期限切れは数えない", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await submit(passage, user.id, RANGE.from)
        await submit(passage, user.id, RANGE.to)
        await submit(passage, user.id, at("2026-10-08T14:59:59.999Z"))
        await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T00:00:00.000Z"), userId: user.id })
        await insertReadingAttempt(passage.id, { startedAt: at("2026-10-11T00:00:00.000Z"), status: "expired", userId: user.id })

        expect(await adminStatsRepository.summarizeOverview(RANGE)).toMatchObject({ solvedAttempts: 1, solvedUsers: 1 })
      })

      it("誰も学習していなければすべて 0", async () => {
        expect(await adminStatsRepository.summarizeOverview(RANGE)).toEqual({
          activeUsers: 0,
          correctCount: 0,
          elapsedSecondsSum: 0,
          listenedAttempts: 0,
          lookedUpAttempts: 0,
          newUsers: 0,
          overtimeAttempts: 0,
          questionCount: 0,
          solvedAttempts: 0,
          solvedUsers: 0,
          totalUsers: 0,
          translatedAttempts: 0,
          translatedQuestionAttempts: 0,
        })
      })
    })
  })

  describe("findOverviewSeries", () => {
    describe("正常系", () => {
      it("日ごと：提出の無い日は 0 で返り、日本時間の 23:59 と翌 0:00 の提出は別の日になる", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await submit(passage, user.id, at("2026-10-12T14:59:59.000Z"))
        await submit(passage, user.id, at("2026-10-12T15:00:00.000Z"))

        const points = await adminStatsRepository.findOverviewSeries({ bucket: "day", fromDate: "2026-10-11", toDate: "2026-10-14" })

        expect(points.map((point) => [point.date, point.solvedAttempts, point.activeUsers])).toEqual([
          ["2026-10-11", 0, 0],
          ["2026-10-12", 1, 1],
          ["2026-10-13", 1, 1],
          ["2026-10-14", 0, 0],
        ])
      })

      it("日ごと：始まりの日の 0 時ちょうどと終わりの日の 23:59:59.999 は入り、その 1ms 前・翌日の 0 時は入らない", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await submit(passage, user.id, at("2026-10-10T14:59:59.999Z"))
        await submit(passage, user.id, at("2026-10-10T15:00:00.000Z"))
        await submit(passage, user.id, at("2026-10-14T14:59:59.999Z"))
        await submit(passage, user.id, at("2026-10-14T15:00:00.000Z"))

        const points = await adminStatsRepository.findOverviewSeries({ bucket: "day", fromDate: "2026-10-11", toDate: "2026-10-14" })

        expect(points.map((point) => point.solvedAttempts)).toEqual([1, 0, 0, 1])
      })

      it("週ごと：日本時間の月曜で区切り、登録・単語帳の答えも同じ週に数える", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertUserCreatedAt(at("2026-10-04T15:00:00.000Z"))
        await submit(passage, user.id, at("2026-10-11T14:59:00.000Z"))
        await submit(passage, user.id, at("2026-10-11T15:00:00.000Z"))
        const card = await insertVocabularyCard(user.id, { lemma: "effect" })
        await insertVocabularyReview(user.id, card.id, { createdAt: at("2026-10-12T00:00:00.000Z") })

        const points = await adminStatsRepository.findOverviewSeries({ bucket: "week", fromDate: "2026-10-05", toDate: "2026-10-12" })

        expect(points).toEqual([
          { activeUsers: 1, date: "2026-10-05", newUsers: 1, solvedAttempts: 1 },
          { activeUsers: 1, date: "2026-10-12", newUsers: 0, solvedAttempts: 1 },
        ])
      })

      it("週ごと：最後の週の日曜 23:59 は入り、翌週の月曜 0 時は入らない", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertUserCreatedAt(at("2026-09-01T00:00:00.000Z"))
        await submit(passage, user.id, at("2026-10-18T14:59:00.000Z"))
        await submit(passage, user.id, at("2026-10-18T15:00:00.000Z"))

        const points = await adminStatsRepository.findOverviewSeries({ bucket: "week", fromDate: "2026-10-12", toDate: "2026-10-12" })

        expect(points).toEqual([{ activeUsers: 1, date: "2026-10-12", newUsers: 0, solvedAttempts: 1 }])
      })
    })
  })

  describe("findPassageStats", () => {
    const query = { ...RANGE, limit: 50, offset: 0, order: "desc" as const, sort: "solved_users" as const }

    describe("正常系", () => {
      it("公開中の問題は解かれていなくても 0 で入り、非公開に戻した問題は期間内に解かれていれば入る。解いた人数の多い順", async () => {
        const popular = await insertPassageWithQuestions({ title: "Popular" })
        const unsolved = await insertPassageWithQuestions({ title: "Unsolved" })
        const unpublished = await insertPassageWithQuestions({ publishedAt: null, status: "draft", title: "Unpublished" })
        await insertPassageWithQuestions({ publishedAt: null, status: "draft", title: "Draft" })
        const [first, second] = [await insertAttemptUser(), await insertAttemptUser()]
        await submit(popular, first.id, at("2026-10-12T00:00:00.000Z"), { translatedQuestionCount: 1 })
        await submit(popular, second.id, at("2026-10-12T00:00:00.000Z"))
        await submit(unpublished, first.id, at("2026-10-12T00:00:00.000Z"))

        const result = await adminStatsRepository.findPassageStats(query)

        expect(result.total).toBe(3)
        expect(result.items.map((item) => [item.title, item.solvedUsers, item.solvedAttempts])).toEqual([
          ["Popular", 2, 2],
          ["Unpublished", 1, 1],
          ["Unsolved", 0, 0],
        ])
        expect(result.items[2]).toMatchObject({ id: unsolved.id, correctCount: 0, publishedAt: at("2026-10-01T03:00:00.000Z"), status: "published" })
        expect(result.items[0].source).toEqual({ id: popular.sourceId, name: "React 公式ドキュメント" })
        expect(result.items.map((item) => item.translatedQuestionAttempts)).toEqual([1, 0, 0])
      })

      it("正答率の低い順に並べると、解かれていない問題は最後（NULLS LAST）。同じ値は ID の順", async () => {
        const high = await insertPassageWithQuestions({ title: "High" })
        const sameAsHigh = await insertPassageWithQuestions({ title: "SameAsHigh" })
        const low = await insertPassageWithQuestions({ title: "Low" })
        await insertPassageWithQuestions({ title: "Unsolved" })
        const user = await insertAttemptUser()
        await submit(high, user.id, at("2026-10-12T00:00:00.000Z"))
        await submit(sameAsHigh, user.id, at("2026-10-12T00:00:00.000Z"))
        await submit(low, user.id, at("2026-10-12T00:00:00.000Z"), { correctness: [false, false, true] })

        const ascending = await adminStatsRepository.findPassageStats({ ...query, order: "asc", sort: "correct_rate" })
        const descending = await adminStatsRepository.findPassageStats({ ...query, order: "desc", sort: "correct_rate" })

        expect(ascending.items.map((item) => item.title)).toEqual(["Low", "High", "SameAsHigh", "Unsolved"])
        expect(descending.items.map((item) => item.title)).toEqual(["High", "SameAsHigh", "Low", "Unsolved"])
      })

      it("解いた回数・平均の解答時間・時間超過の割合・公開日（非公開で null は最後）で並べられる", async () => {
        const fast = await insertPassageWithQuestions({ publishedAt: at("2026-10-01T00:00:00.000Z"), title: "Fast" })
        const slow = await insertPassageWithQuestions({ publishedAt: at("2026-10-05T00:00:00.000Z"), title: "Slow" })
        const unpublished = await insertPassageWithQuestions({ publishedAt: null, status: "draft", title: "Unpublished" })
        const user = await insertAttemptUser()
        await submit(fast, user.id, at("2026-10-12T00:00:00.000Z"), { elapsedSeconds: 60 })
        await submit(fast, user.id, at("2026-10-12T01:00:00.000Z"), { elapsedSeconds: 60 })
        await submit(slow, user.id, at("2026-10-12T00:00:00.000Z"), { elapsedSeconds: 300, isOvertime: true })
        await submit(unpublished, user.id, at("2026-10-12T00:00:00.000Z"), { elapsedSeconds: 200 })

        const titlesBy = async (sort: "average_elapsed_seconds" | "overtime_rate" | "published_at" | "solved_attempts") =>
          (await adminStatsRepository.findPassageStats({ ...query, sort })).items.map((item) => item.title)

        expect(await titlesBy("solved_attempts")).toEqual(["Fast", "Slow", "Unpublished"])
        expect(await titlesBy("average_elapsed_seconds")).toEqual(["Slow", "Unpublished", "Fast"])
        expect(await titlesBy("overtime_rate")).toEqual(["Slow", "Fast", "Unpublished"])
        expect(await titlesBy("published_at")).toEqual(["Slow", "Fast", "Unpublished"])
      })

      it("タイトルの絞り込みは大文字・小文字を区別せず、% は文字として扱う。offset と total", async () => {
        await insertPassageWithQuestions({ title: "100% Effects" })
        await insertPassageWithQuestions({ title: "Effects of State" })
        await insertPassageWithQuestions({ title: "Other" })

        expect((await adminStatsRepository.findPassageStats({ ...query, q: "effects" })).total).toBe(2)
        expect((await adminStatsRepository.findPassageStats({ ...query, q: "%" })).items.map((item) => item.title)).toEqual(["100% Effects"])
        expect(await adminStatsRepository.findPassageStats({ ...query, limit: 1, offset: 1, q: "effects" })).toMatchObject({ total: 2 })
      })
    })

    describe("異常系", () => {
      it("範囲外のページは空の配列で、total は全体の件数", async () => {
        await insertPassageWithQuestions()
        await insertPassageWithQuestions()

        expect(await adminStatsRepository.findPassageStats({ ...query, offset: 50 })).toEqual({ items: [], total: 2 })
      })

      it("非公開の問題が期間外にだけ解かれていれば入らない", async () => {
        const unpublished = await insertPassageWithQuestions({ publishedAt: null, status: "draft" })
        const user = await insertAttemptUser()
        await submit(unpublished, user.id, at("2026-10-01T00:00:00.000Z"))

        expect(await adminStatsRepository.findPassageStats(query)).toEqual({ items: [], total: 0 })
      })
    })
  })

  describe("findPassageStatsById", () => {
    describe("正常系", () => {
      it("状態を問わず 1 つの問題の成績を返す（期間外の提出は数えない）", async () => {
        const passage = await insertPassageWithQuestions({ publishedAt: null, status: "draft" })
        const user = await insertAttemptUser()
        await submit(passage, user.id, at("2026-10-12T00:00:00.000Z"), { elapsedSeconds: 120 })
        await submit(passage, user.id, at("2026-10-01T00:00:00.000Z"))

        expect(await adminStatsRepository.findPassageStatsById(passage.id, RANGE)).toMatchObject({
          id: passage.id,
          elapsedSecondsSum: 120,
          publishedAt: null,
          solvedAttempts: 1,
          status: "draft",
        })
      })
    })

    describe("異常系", () => {
      it("問題が無ければ null", async () => {
        expect(await adminStatsRepository.findPassageStatsById(999_999, RANGE)).toBeNull()
      })
    })
  })

  describe("findQuestionStats", () => {
    describe("正常系", () => {
      it("選んだ選択肢・未回答・正解の数を設問ごとに数え、解かれていない設問も返す", async () => {
        const passage = await insertPassageWithQuestions()
        const [first, second, third] = [await insertAttemptUser(), await insertAttemptUser(), await insertAttemptUser()]
        const q1q2 = { ...passage, questionIds: passage.questionIds.slice(0, 2) }
        await submit(q1q2, first.id, at("2026-10-12T00:00:00.000Z"), { correctness: [true, false], selectedChoiceIndexes: [1, 0] })
        await submit(q1q2, second.id, at("2026-10-12T00:00:00.000Z"), { correctness: [false, false], selectedChoiceIndexes: [0, null] })
        await submit(q1q2, third.id, at("2026-10-12T00:00:00.000Z"), { correctness: [true, true], selectedChoiceIndexes: [1, 2] })

        const stats = await adminStatsRepository.findQuestionStats(passage.id, RANGE)

        expect(stats.map((question) => [question.orderIndex, question.answerCount, question.correctCount, question.choiceCounts, question.unansweredCount])).toEqual([
          [0, 3, 2, [1, 2, 0, 0], 0],
          [1, 3, 1, [1, 0, 1, 0], 1],
          [2, 0, 0, [0, 0, 0, 0], 0],
        ])
        expect(stats[0]).toMatchObject({ id: passage.questionIds[0], correctChoiceIndex: 1, type: "main_idea" })
      })
    })

    describe("異常系", () => {
      it("期間外・挑戦中の解答は数えない", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await submit(passage, user.id, at("2026-10-01T00:00:00.000Z"))
        const inProgress = await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T00:00:00.000Z"), userId: user.id })
        await testDb.insert(attemptAnswers).values(
          passage.questionIds.map((questionId) => ({ attemptId: inProgress.id, isCorrect: false, questionId, selectedChoiceIndex: 0 })),
        )

        const stats = await adminStatsRepository.findQuestionStats(passage.id, RANGE)

        expect(stats.map((question) => [question.answerCount, question.choiceCounts, question.correctCount, question.unansweredCount])).toEqual([
          [0, [0, 0, 0, 0], 0, 0],
          [0, [0, 0, 0, 0], 0, 0],
          [0, [0, 0, 0, 0], 0, 0],
        ])
      })
    })
  })

  describe("findFirstUserCreatedAt", () => {
    describe("正常系", () => {
      it("最初のユーザーの登録日時", async () => {
        await insertUserCreatedAt(at("2026-05-01T00:00:00.000Z"))
        await insertUserCreatedAt(at("2026-04-06T09:30:00.000Z"))

        expect(await adminStatsRepository.findFirstUserCreatedAt()).toEqual(at("2026-04-06T09:30:00.000Z"))
      })
    })

    describe("異常系", () => {
      it("ユーザーがいなければ null", async () => {
        expect(await adminStatsRepository.findFirstUserCreatedAt()).toBeNull()
      })
    })
  })
})
