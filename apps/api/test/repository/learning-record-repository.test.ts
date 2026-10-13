import { DrizzleLearningRecordRepository } from "../../src/repository/drizzle/learning-record-repository"
import type { LearningRecordRepository } from "../../src/repository/learning-record-repository"
import { PrismaLearningRecordRepository } from "../../src/repository/prisma/learning-record-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import { createSubmittedAttempt } from "../fixture/learning-record"
import { insertAttemptUser, insertGeneratedPassage, insertReadingAttempt } from "../fixture/passage"

/**
 * Prisma / Drizzle の両実装が LearningRecordRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する
 */
const implementations: [string, LearningRecordRepository][] = [
  ["Drizzle", new DrizzleLearningRecordRepository(testDb)],
  ["Prisma", new PrismaLearningRecordRepository(testPrisma)],
]

const at = (iso: string): Date => new Date(iso)

/**
 * 設問 3 問（要旨・詳細・語義の順）つきの公開中の問題
 */
const insertPassageWithQuestions = async (title = "Synchronizing with Effects") => {
  const generated = await insertGeneratedPassage({ publishedAt: at("2026-10-01T03:00:00.000Z"), status: "published", title })
  return { id: generated.passage.id, questionIds: generated.questions.map((question) => question.id) }
}

/**
 * 数えてはいけない挑戦（そのユーザーの挑戦中・期限切れと、他のユーザーの提出済み）を入れる
 */
const insertNoiseAttempts = async (passageId: number, questionIds: number[], userId: number, studyDate: string) => {
  const otherUser = await insertAttemptUser()
  await insertReadingAttempt(passageId, { startedAt: at(`${studyDate}T01:00:00.000Z`), userId })
  await insertReadingAttempt(passageId, { startedAt: at(`${studyDate}T00:00:00.000Z`), status: "expired", userId })
  await createSubmittedAttempt({ elapsedSeconds: 999, passageId, questionIds, studyDate, userId: otherUser.id })
  return otherUser
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s LearningRecordRepository", (_name, learningRecordRepository) => {
  describe("提出していない挑戦・他のユーザーの挑戦", () => {
    describe("異常系", () => {
      it("挑戦中・期限切れの挑戦と他のユーザーの挑戦は、どのメソッドの結果にも入らない", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-10")

        expect(await learningRecordRepository.findStudyDates(user.id)).toEqual([])
        expect(await learningRecordRepository.findSubmittedAttempts(user.id, { limit: 10 })).toEqual([])
        expect(await learningRecordRepository.summarizeAccuracyByQuestionType(user.id)).toEqual([])
        expect(await learningRecordRepository.summarizeByDate(user.id, { from: "2026-10-01", to: "2026-10-31" })).toEqual([])
        expect(await learningRecordRepository.summarizeNoAssistAccuracy(user.id)).toEqual({ correctCount: 0, questionCount: 0 })
        expect(await learningRecordRepository.summarizeTotals(user.id)).toEqual({
          attemptCount: 0,
          correctCount: 0,
          passageCount: 0,
          questionCount: 0,
          studySeconds: 0,
        })
      })
    })
  })

  describe("findStudyDates", () => {
    describe("正常系", () => {
      it("提出した挑戦の学習した日を、重複なしで日付の昇順に返す", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-09")
        for (const studyDate of ["2026-10-11", "2026-09-30", "2026-10-11", "2026-10-01"]) {
          await createSubmittedAttempt({ passageId: passage.id, questionIds: passage.questionIds, studyDate, userId: user.id })
        }

        expect(await learningRecordRepository.findStudyDates(user.id)).toEqual(["2026-09-30", "2026-10-01", "2026-10-11"])
      })
    })
  })

  describe("summarizeByDate", () => {
    describe("正常系", () => {
      it("期間内の日ごとに、挑戦数・正答数・設問数・学習秒数をまとめて日付の昇順に返す", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-06")
        await createSubmittedAttempt({
          correctness: [true, false, true],
          elapsedSeconds: 200,
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-06",
          userId: user.id,
        })
        await createSubmittedAttempt({
          correctness: [true, true, true],
          elapsedSeconds: 150,
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-06",
          userId: user.id,
        })
        await createSubmittedAttempt({
          correctness: [false, false, true],
          elapsedSeconds: 90,
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-08",
          userId: user.id,
        })

        expect(await learningRecordRepository.summarizeByDate(user.id, { from: "2026-10-05", to: "2026-10-11" })).toEqual([
          { attemptCount: 2, correctCount: 5, date: "2026-10-06", questionCount: 6, studySeconds: 350 },
          { attemptCount: 1, correctCount: 1, date: "2026-10-08", questionCount: 3, studySeconds: 90 },
        ])
      })

      it("from と to の日を含み、範囲外の日（前日・翌日）を含まない（境界値）", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        for (const studyDate of ["2026-10-04", "2026-10-05", "2026-10-11", "2026-10-12"]) {
          await createSubmittedAttempt({ passageId: passage.id, questionIds: passage.questionIds, studyDate, userId: user.id })
        }

        const summaries = await learningRecordRepository.summarizeByDate(user.id, { from: "2026-10-05", to: "2026-10-11" })

        expect(summaries.map((summary) => summary.date)).toEqual(["2026-10-05", "2026-10-11"])
      })

      it("from と to が同じ日ならその日だけを返す", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        for (const studyDate of ["2026-10-10", "2026-10-11"]) {
          await createSubmittedAttempt({ passageId: passage.id, questionIds: passage.questionIds, studyDate, userId: user.id })
        }

        const summaries = await learningRecordRepository.summarizeByDate(user.id, { from: "2026-10-11", to: "2026-10-11" })

        expect(summaries.map((summary) => summary.date)).toEqual(["2026-10-11"])
      })
    })
  })

  describe("summarizeTotals", () => {
    describe("正常系", () => {
      it("挑戦数・解いた問題の数・正答数・設問数・学習秒数の累計を返す。同じ問題を 2 回解いても問題の数は 1", async () => {
        const passage = await insertPassageWithQuestions()
        const otherPassage = await insertPassageWithQuestions("Pod Lifecycle")
        const user = await insertAttemptUser()
        await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-10")
        await createSubmittedAttempt({
          correctness: [true, false, false],
          elapsedSeconds: 100,
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-09",
          userId: user.id,
        })
        await createSubmittedAttempt({
          correctness: [true, true, true],
          elapsedSeconds: 120,
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-10",
          userId: user.id,
        })
        await createSubmittedAttempt({
          correctness: [true, true, false],
          elapsedSeconds: 300,
          passageId: otherPassage.id,
          questionIds: otherPassage.questionIds,
          studyDate: "2026-10-10",
          userId: user.id,
        })

        expect(await learningRecordRepository.summarizeTotals(user.id)).toEqual({
          attemptCount: 3,
          correctCount: 6,
          passageCount: 2,
          questionCount: 9,
          studySeconds: 520,
        })
      })
    })
  })

  describe("summarizeAccuracyByQuestionType", () => {
    describe("正常系", () => {
      it("設問の種類ごとの設問数と正答数を返す（設問の無い種類は返さない）", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-10")
        /**
         * 設問は要旨・詳細・語義の順
         */
        await createSubmittedAttempt({
          correctness: [true, false, false],
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-09",
          userId: user.id,
        })
        await createSubmittedAttempt({
          correctness: [true, true, false],
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-10",
          userId: user.id,
        })

        const counts = await learningRecordRepository.summarizeAccuracyByQuestionType(user.id)

        expect([...counts].sort((left, right) => left.type.localeCompare(right.type))).toEqual([
          { correctCount: 1, questionCount: 2, type: "detail" },
          { correctCount: 2, questionCount: 2, type: "main_idea" },
          { correctCount: 0, questionCount: 2, type: "vocabulary" },
        ])
      })
    })
  })

  describe("summarizeNoAssistAccuracy", () => {
    describe("正常系", () => {
      it("訳も単語の意味も使わなかった挑戦だけの正答数と設問数を返す", async () => {
        const passage = await insertPassageWithQuestions()
        const user = await insertAttemptUser()
        const base = { passageId: passage.id, questionIds: passage.questionIds, studyDate: "2026-10-10", userId: user.id }
        await createSubmittedAttempt({ ...base, correctness: [true, true, false] })
        await createSubmittedAttempt({ ...base, correctness: [true, false, false] })
        await createSubmittedAttempt({ ...base, correctness: [true, true, true], translatedBlockCount: 1 })
        await createSubmittedAttempt({ ...base, correctness: [true, true, true], wordLookupCount: 1 })

        expect(await learningRecordRepository.summarizeNoAssistAccuracy(user.id)).toEqual({ correctCount: 3, questionCount: 6 })
      })
    })
  })

  describe("findSubmittedAttempts", () => {
    /**
     * 提出日時の異なる 3 件と、同時刻の 2 件（id の降順に並ぶ）を入れる
     */
    const setupAttempts = async () => {
      const passage = await insertPassageWithQuestions()
      const otherPassage = await insertPassageWithQuestions("Pod Lifecycle")
      const user = await insertAttemptUser()
      const base = { passageId: passage.id, questionIds: passage.questionIds, userId: user.id }
      const oldest = await createSubmittedAttempt({ ...base, studyDate: "2026-10-09", submittedAt: at("2026-10-09T03:00:00.000Z") })
      const sameTimeFirst = await createSubmittedAttempt({ ...base, studyDate: "2026-10-10", submittedAt: at("2026-10-10T03:00:00.000Z") })
      const sameTimeSecond = await createSubmittedAttempt({ ...base, studyDate: "2026-10-10", submittedAt: at("2026-10-10T03:00:00.000Z") })
      const newest = await createSubmittedAttempt({
        correctness: [true, false, true],
        elapsedSeconds: 312,
        isOvertime: true,
        passageId: otherPassage.id,
        questionIds: otherPassage.questionIds,
        studyDate: "2026-10-11",
        submittedAt: at("2026-10-10T23:14:05.123Z"),
        translatedBlockCount: 1,
        userId: user.id,
        wordLookupCount: 2,
      })
      await insertNoiseAttempts(passage.id, passage.questionIds, user.id, "2026-10-11")
      return { newest, oldest, otherPassage, sameTimeFirst, sameTimeSecond, user }
    }

    describe("正常系", () => {
      it("提出日時の新しい順（同時刻は id の降順）に、問題のタイトルつきで返す", async () => {
        const { newest, oldest, otherPassage, sameTimeFirst, sameTimeSecond, user } = await setupAttempts()

        const attempts = await learningRecordRepository.findSubmittedAttempts(user.id, { limit: 10 })

        expect(attempts.map((attempt) => attempt.id)).toEqual([newest.id, sameTimeSecond.id, sameTimeFirst.id, oldest.id])
        expect(attempts[0]).toEqual({
          id: newest.id,
          correctCount: 2,
          elapsedSeconds: 312,
          isOvertime: true,
          passageId: otherPassage.id,
          passageTitle: "Pod Lifecycle",
          questionCount: 3,
          studyDate: "2026-10-11",
          submittedAt: at("2026-10-10T23:14:05.123Z"),
          translatedBlockCount: 1,
          wordLookupCount: 2,
        })
      })

      it("limit 件だけ返し、cursor の挑戦より後ろ（古い側）から続きを返す。同時刻の挑戦の間でも続きが取れる", async () => {
        const { newest, oldest, sameTimeFirst, sameTimeSecond, user } = await setupAttempts()

        const firstPage = await learningRecordRepository.findSubmittedAttempts(user.id, { limit: 2 })
        const secondPage = await learningRecordRepository.findSubmittedAttempts(user.id, { cursor: firstPage[1].id, limit: 2 })
        const lastPage = await learningRecordRepository.findSubmittedAttempts(user.id, { cursor: oldest.id, limit: 2 })

        expect(firstPage.map((attempt) => attempt.id)).toEqual([newest.id, sameTimeSecond.id])
        expect(secondPage.map((attempt) => attempt.id)).toEqual([sameTimeFirst.id, oldest.id])
        expect(lastPage).toEqual([])
      })

      it("date を指定するとその日（学習した日）の挑戦だけを返す", async () => {
        const { sameTimeFirst, sameTimeSecond, user } = await setupAttempts()

        const attempts = await learningRecordRepository.findSubmittedAttempts(user.id, { date: "2026-10-10", limit: 10 })

        expect(attempts.map((attempt) => attempt.id)).toEqual([sameTimeSecond.id, sameTimeFirst.id])
      })

      it("date と cursor を組み合わせられる", async () => {
        const { sameTimeFirst, sameTimeSecond, user } = await setupAttempts()

        const attempts = await learningRecordRepository.findSubmittedAttempts(user.id, {
          cursor: sameTimeSecond.id,
          date: "2026-10-10",
          limit: 10,
        })

        expect(attempts.map((attempt) => attempt.id)).toEqual([sameTimeFirst.id])
      })
    })

    describe("異常系", () => {
      it("他のユーザーの挑戦・存在しない id を cursor にすると 0 件", async () => {
        const { user } = await setupAttempts()
        const passage = await insertPassageWithQuestions("Other")
        const otherUser = await insertAttemptUser()
        const othersAttempt = await createSubmittedAttempt({
          passageId: passage.id,
          questionIds: passage.questionIds,
          studyDate: "2026-10-12",
          userId: otherUser.id,
        })

        expect(await learningRecordRepository.findSubmittedAttempts(user.id, { cursor: othersAttempt.id, limit: 10 })).toEqual([])
        expect(await learningRecordRepository.findSubmittedAttempts(user.id, { cursor: 999_999, limit: 10 })).toEqual([])
      })
    })
  })
})
