import { DrizzleReadingAttemptRepository } from "../../src/repository/drizzle/reading-attempt-repository"
import { PrismaReadingAttemptRepository } from "../../src/repository/prisma/reading-attempt-repository"
import type { ReadingAttemptRepository } from "../../src/repository/reading-attempt-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import {
  insertAttemptUser,
  insertPassageDocument,
  insertPassageSource,
  insertPublishedPassage,
  insertReadingAttempt,
  insertSubmittedAttempt,
} from "../fixture/passage"

/**
 * Prisma / Drizzle の両実装が ReadingAttemptRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する。
 */
const implementations: [string, ReadingAttemptRepository][] = [
  ["Drizzle", new DrizzleReadingAttemptRepository(testDb)],
  ["Prisma", new PrismaReadingAttemptRepository(testPrisma)],
]

const at = (iso: string): Date => new Date(iso)

/**
 * 期限内の境目（これより後に開始した in_progress だけが期限内）
 */
const ALIVE_SINCE = at("2026-10-12T00:00:00.000Z")

/**
 * 公開中の問題を count 件入れる
 */
const insertPublishedPassages = async (count: number) => {
  const source = await insertPassageSource()
  const document = await insertPassageDocument(source.id)
  const rows = []
  for (let index = 0; index < count; index++) rows.push(await insertPublishedPassage(document.id))
  return rows
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s ReadingAttemptRepository", (_name, readingAttemptRepository) => {
  describe("findAliveInProgress", () => {
    describe("正常系", () => {
      it("aliveSince より後に開始した、そのユーザーのその問題の挑戦中を返す（境界値: 1 ミリ秒後）", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const attempt = await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T00:00:00.001Z"), userId: user.id })

        const found = await readingAttemptRepository.findAliveInProgress(user.id, passage.id, ALIVE_SINCE)

        expect(found).toEqual({
          id: attempt.id,
          correctCount: null,
          elapsedSeconds: null,
          isOvertime: null,
          passageId: passage.id,
          questionCount: null,
          startedAt: at("2026-10-12T00:00:00.001Z"),
          status: "in_progress",
          studyDate: null,
          submittedAt: null,
          timeLimitSeconds: 180,
          translatedBlockCount: 0,
          userId: user.id,
          wordLookupCount: 0,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      })
    })

    describe("異常系", () => {
      it("ちょうど aliveSince に開始した挑戦中は期限切れとして null を返す（境界値）", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        await insertReadingAttempt(passage.id, { startedAt: ALIVE_SINCE, userId: user.id })

        expect(await readingAttemptRepository.findAliveInProgress(user.id, passage.id, ALIVE_SINCE)).toBeNull()
      })

      it("提出済み・期限切れ・他人の挑戦中・別の問題の挑戦中しか無ければ null を返す", async () => {
        const [passage, otherPassage] = await insertPublishedPassages(2)
        const user = await insertAttemptUser()
        await insertSubmittedAttempt(passage.id, user.id, 3, { startedAt: at("2026-10-12T10:00:00.000Z") })
        await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T10:00:00.000Z"), status: "expired", userId: user.id })
        await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T10:00:00.000Z") })
        await insertReadingAttempt(otherPassage.id, { startedAt: at("2026-10-12T10:00:00.000Z"), userId: user.id })

        expect(await readingAttemptRepository.findAliveInProgress(user.id, passage.id, ALIVE_SINCE)).toBeNull()
      })
    })
  })

  describe("summarizeByPassageIds", () => {
    describe("正常系", () => {
      it("提出済みの数と最高正答数、期限内の挑戦中の ID を問題ごとに passageId の昇順で返す", async () => {
        const [submitted, inProgressOnly, expiredOnly, notRequested] = await insertPublishedPassages(4)
        const user = await insertAttemptUser()
        const other = await insertAttemptUser()
        await insertSubmittedAttempt(submitted.id, user.id, 2)
        await insertSubmittedAttempt(submitted.id, user.id, 3)
        await insertSubmittedAttempt(submitted.id, other.id, 4, { questionCount: 4 })
        const resumed = await insertReadingAttempt(submitted.id, { startedAt: at("2026-10-12T12:00:00.000Z"), userId: user.id })
        const alive = await insertReadingAttempt(inProgressOnly.id, { startedAt: at("2026-10-12T00:00:00.001Z"), userId: user.id })
        await insertReadingAttempt(expiredOnly.id, { startedAt: ALIVE_SINCE, userId: user.id })
        await insertReadingAttempt(expiredOnly.id, { startedAt: at("2026-10-01T00:00:00.000Z"), status: "expired", userId: user.id })
        await insertSubmittedAttempt(notRequested.id, user.id, 1)

        const summaries = await readingAttemptRepository.summarizeByPassageIds(
          user.id,
          [inProgressOnly.id, expiredOnly.id, submitted.id],
          ALIVE_SINCE,
        )

        expect(summaries).toEqual([
          { attemptCount: 2, bestCorrectCount: 3, inProgressAttemptId: resumed.id, passageId: submitted.id },
          { attemptCount: 0, bestCorrectCount: null, inProgressAttemptId: alive.id, passageId: inProgressOnly.id },
        ])
      })

      it("問題の ID が空なら空配列を返す", async () => {
        const user = await insertAttemptUser()

        expect(await readingAttemptRepository.summarizeByPassageIds(user.id, [], ALIVE_SINCE)).toEqual([])
      })
    })
  })
})
