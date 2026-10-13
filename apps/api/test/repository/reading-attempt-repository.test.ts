import {
  attemptAnswers,
  attemptWordLookups,
  createDrizzleClient,
  createPrismaClient,
  dictionaryEntries,
  eq,
  passageGlossaryEntries,
  readingAttempts,
} from "@repo/db"

import { DrizzleReadingAttemptRepository } from "../../src/repository/drizzle/reading-attempt-repository"
import { DrizzleTransactionRunner } from "../../src/repository/drizzle/transaction-runner"
import { PrismaReadingAttemptRepository } from "../../src/repository/prisma/reading-attempt-repository"
import { PrismaTransactionRunner } from "../../src/repository/prisma/transaction-runner"
import type { ReadingAttemptRepository } from "../../src/repository/reading-attempt-repository"
import type { TransactionRunner } from "../../src/repository/transaction"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import {
  insertAttemptUser,
  insertGeneratedPassage,
  insertPassageDocument,
  insertPassageSource,
  insertPublishedPassage,
  insertReadingAttempt,
  insertSubmittedAttempt,
} from "../fixture/passage"

/**
 * read replica の接続先として、同じサーバーの存在しない DB を指す（replica を通った読み取りは必ず失敗する）
 */
const buildMissingReplicaUrl = (): string => {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5433/tech-english_test")
  url.pathname = "/tech-english_missing_replica"
  return url.toString()
}

const brokenReplicaDb = createDrizzleClient({ onError: () => undefined, replicaUrl: buildMissingReplicaUrl() })
const brokenReplicaPrisma = createPrismaClient({ replicaUrl: buildMissingReplicaUrl() })

/**
 * Prisma / Drizzle の両実装が ReadingAttemptRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する。
 * 3 つ目は tx を渡す書き込みに使う TransactionRunner、4 つ目は read replica に届かない client を使う同じ実装
 */
const implementations: [string, ReadingAttemptRepository, TransactionRunner, ReadingAttemptRepository][] = [
  [
    "Drizzle",
    new DrizzleReadingAttemptRepository(testDb),
    new DrizzleTransactionRunner(testDb),
    new DrizzleReadingAttemptRepository(brokenReplicaDb),
  ],
  [
    "Prisma",
    new PrismaReadingAttemptRepository(testPrisma),
    new PrismaTransactionRunner(testPrisma),
    new PrismaReadingAttemptRepository(brokenReplicaPrisma),
  ],
]

const at = (iso: string): Date => new Date(iso)

/**
 * 期限内の境目（これより後に開始した in_progress だけが期限内）
 */
const ALIVE_SINCE = at("2026-10-12T00:00:00.000Z")

/**
 * そのユーザーの挑戦の行を id の順に読む
 */
const selectAttemptsByUser = async (userId: number) =>
  testDb.select().from(readingAttempts).where(eq(readingAttempts.userId, userId)).orderBy(readingAttempts.id)

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

/**
 * 提出の値（markSubmitted の入力の attemptId 以外）
 */
const SUBMIT_VALUES = {
  correctCount: 2,
  elapsedSeconds: 175,
  isOvertime: false,
  questionCount: 3,
  studyDate: "2026-10-13",
  submittedAt: at("2026-10-12T15:30:00.123Z"),
  translatedBlockCount: 2,
  wordLookupCount: 3,
}

/**
 * 設問・用語集つきの公開中の問題と、そのユーザーの挑戦中を入れる
 */
const setupInProgressAttempt = async () => {
  const generated = await insertGeneratedPassage({ publishedAt: at("2026-10-12T03:00:00.000Z"), status: "published" })
  const user = await insertAttemptUser()
  const attempt = await insertReadingAttempt(generated.passage.id, { startedAt: at("2026-10-12T15:27:00.000Z"), userId: user.id })
  return { ...generated, attempt, user }
}

/**
 * 挑戦の調べた単語の行を id の順に読む
 */
const selectWordLookups = async (attemptId: number) =>
  testDb.select().from(attemptWordLookups).where(eq(attemptWordLookups.attemptId, attemptId)).orderBy(attemptWordLookups.id)

/**
 * 挑戦の回答の行を id の順に読む
 */
const selectAnswers = async (attemptId: number) =>
  testDb.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId)).orderBy(attemptAnswers.id)

afterAll(async () => {
  await cleanupTestData()
  await Promise.all([brokenReplicaDb.$disconnect(), brokenReplicaPrisma.$disconnect()])
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s ReadingAttemptRepository", (_name, readingAttemptRepository, transactionRunner, brokenReplicaRepository) => {
  describe("createInProgress", () => {
    describe("正常系", () => {
      it("挑戦中の挑戦を作って返す", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()

        const created = await readingAttemptRepository.createInProgress({
          passageId: passage.id,
          startedAt: at("2026-10-12T10:00:00.123Z"),
          timeLimitSeconds: 240,
          userId: user.id,
        })

        expect(created).toEqual({
          id: expect.any(Number),
          correctCount: null,
          elapsedSeconds: null,
          isOvertime: null,
          listenedBlockCount: 0,
          passageId: passage.id,
          questionCount: null,
          startedAt: at("2026-10-12T10:00:00.123Z"),
          status: "in_progress",
          studyDate: null,
          submittedAt: null,
          timeLimitSeconds: 240,
          translatedBlockCount: 0,
          userId: user.id,
          wordLookupCount: 0,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
        const rows = await selectAttemptsByUser(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: created?.id, passageId: passage.id, status: "in_progress", timeLimitSeconds: 240 })
      })

      it("同じ問題に期限切れ・提出済みしか無ければ作れる。他人の挑戦中・別の問題の挑戦中があっても作れる", async () => {
        const [passage, otherPassage] = await insertPublishedPassages(2)
        const user = await insertAttemptUser()
        await insertReadingAttempt(passage.id, { startedAt: at("2026-10-01T00:00:00.000Z"), status: "expired", userId: user.id })
        await insertSubmittedAttempt(passage.id, user.id, 3)
        await insertReadingAttempt(passage.id)
        await insertReadingAttempt(otherPassage.id, { userId: user.id })

        const created = await readingAttemptRepository.createInProgress({
          passageId: passage.id,
          startedAt: at("2026-10-12T10:00:00.000Z"),
          timeLimitSeconds: 180,
          userId: user.id,
        })

        expect(created).toMatchObject({ passageId: passage.id, status: "in_progress", userId: user.id })
        expect(await selectAttemptsByUser(user.id)).toHaveLength(4)
      })
    })

    describe("異常系", () => {
      it("同じユーザー・同じ問題の挑戦中があれば（期限を問わず）作らずに null を返す", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const existing = await insertReadingAttempt(passage.id, { startedAt: at("2026-10-01T00:00:00.000Z"), userId: user.id })

        const created = await readingAttemptRepository.createInProgress({
          passageId: passage.id,
          startedAt: at("2026-10-12T10:00:00.000Z"),
          timeLimitSeconds: 180,
          userId: user.id,
        })

        expect(created).toBeNull()
        const rows = await selectAttemptsByUser(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: existing.id, status: "in_progress" })
      })
    })
  })

  describe("expireStale", () => {
    describe("正常系", () => {
      it("そのユーザーの started_at <= aliveSince の挑戦中だけを expired にし、件数を返す（境界値: ちょうど aliveSince は更新、1 ミリ秒後は残す）", async () => {
        const [passage, otherPassage, thirdPassage] = await insertPublishedPassages(3)
        const user = await insertAttemptUser()
        const other = await insertAttemptUser()
        const atBoundary = await insertReadingAttempt(passage.id, { startedAt: ALIVE_SINCE, userId: user.id })
        const older = await insertReadingAttempt(otherPassage.id, { startedAt: at("2026-10-01T00:00:00.000Z"), userId: user.id })
        const alive = await insertReadingAttempt(thirdPassage.id, { startedAt: at("2026-10-12T00:00:00.001Z"), userId: user.id })
        const submitted = await insertSubmittedAttempt(passage.id, user.id, 3, { startedAt: at("2026-10-01T00:00:00.000Z") })
        const othersStale = await insertReadingAttempt(passage.id, { startedAt: at("2026-10-01T00:00:00.000Z"), userId: other.id })

        const count = await readingAttemptRepository.expireStale(user.id, ALIVE_SINCE)

        expect(count).toBe(2)
        const statusById = new Map(
          [...(await selectAttemptsByUser(user.id)), ...(await selectAttemptsByUser(other.id))].map((row) => [row.id, row.status]),
        )
        expect(Object.fromEntries(statusById)).toEqual({
          [atBoundary.id]: "expired",
          [older.id]: "expired",
          [alive.id]: "in_progress",
          [submitted.id]: "submitted",
          [othersStale.id]: "in_progress",
        })
      })

      it("対象が無ければ 0 を返す", async () => {
        const user = await insertAttemptUser()

        expect(await readingAttemptRepository.expireStale(user.id, ALIVE_SINCE)).toBe(0)
      })
    })
  })

  describe("findByIdForUser", () => {
    describe("正常系", () => {
      it.each([
        ["in_progress"],
        ["expired"],
      ] as const)("自分の %s の挑戦を返す", async (status) => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const attempt = await insertReadingAttempt(passage.id, { startedAt: at("2026-10-12T10:00:00.000Z"), status, userId: user.id })

        expect(await readingAttemptRepository.findByIdForUser(attempt.id, user.id)).toMatchObject({
          id: attempt.id,
          passageId: passage.id,
          startedAt: at("2026-10-12T10:00:00.000Z"),
          status,
          userId: user.id,
        })
      })

      it("自分の提出済みの挑戦は study_date を YYYY-MM-DD で返す", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const attempt = await insertSubmittedAttempt(passage.id, user.id, 2)

        expect(await readingAttemptRepository.findByIdForUser(attempt.id, user.id)).toMatchObject({
          correctCount: 2,
          status: "submitted",
          studyDate: "2026-10-12",
        })
      })
    })

    describe("異常系", () => {
      it("他人の挑戦・存在しない ID は null を返す", async () => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const othersAttempt = await insertReadingAttempt(passage.id)

        expect(await readingAttemptRepository.findByIdForUser(othersAttempt.id, user.id)).toBeNull()
        expect(await readingAttemptRepository.findByIdForUser(999999, user.id)).toBeNull()
      })
    })
  })

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
          listenedBlockCount: 0,
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

  describe("markSubmitted", () => {
    describe("正常系", () => {
      it("tx の中で in_progress の挑戦を submitted にして採点結果と時間を書き、更新後の挑戦を返す", async () => {
        const { attempt, passage, user } = await setupInProgressAttempt()

        const submitted = await transactionRunner.run(async (tx) =>
          readingAttemptRepository.markSubmitted({ ...SUBMIT_VALUES, attemptId: attempt.id }, tx))

        expect(submitted).toEqual({
          id: attempt.id,
          ...SUBMIT_VALUES,
          listenedBlockCount: 0,
          passageId: passage.id,
          startedAt: at("2026-10-12T15:27:00.000Z"),
          status: "submitted",
          timeLimitSeconds: 180,
          userId: user.id,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
        const [row] = await selectAttemptsByUser(user.id)
        expect(row).toMatchObject({ ...SUBMIT_VALUES, id: attempt.id, status: "submitted" })
      })

      it("tx を渡さなくても更新できる", async () => {
        const { attempt, user } = await setupInProgressAttempt()

        const submitted = await readingAttemptRepository.markSubmitted({ ...SUBMIT_VALUES, attemptId: attempt.id })

        expect(submitted).toMatchObject({ id: attempt.id, status: "submitted", studyDate: "2026-10-13" })
        expect((await selectAttemptsByUser(user.id))[0]).toMatchObject({ status: "submitted" })
      })
    })

    describe("異常系", () => {
      it.each([
        ["submitted"],
        ["expired"],
      ] as const)("%s の挑戦は更新せずに null を返す", async (status) => {
        const [passage] = await insertPublishedPassages(1)
        const user = await insertAttemptUser()
        const attempt = status === "submitted"
          ? await insertSubmittedAttempt(passage.id, user.id, 1)
          : await insertReadingAttempt(passage.id, { status, userId: user.id })

        const submitted = await readingAttemptRepository.markSubmitted({ ...SUBMIT_VALUES, attemptId: attempt.id })

        expect(submitted).toBeNull()
        const [row] = await selectAttemptsByUser(user.id)
        expect(row).toMatchObject({ correctCount: attempt.correctCount, status, studyDate: attempt.studyDate })
      })

      it("存在しない挑戦は null を返す", async () => {
        expect(await readingAttemptRepository.markSubmitted({ ...SUBMIT_VALUES, attemptId: 999999 })).toBeNull()
      })
    })
  })

  describe("insertAnswers / findAnswersByAttemptId", () => {
    describe("正常系", () => {
      it("tx の中で回答をまとめて保存し、その挑戦の回答だけを id の昇順で読める", async () => {
        const { attempt, passage, questions, user } = await setupInProgressAttempt()
        const other = await insertReadingAttempt(passage.id)
        const answers = questions.map((question, index) => ({
          attemptId: attempt.id,
          isCorrect: index === 0,
          questionId: question.id,
          selectedChoiceIndex: index === 2 ? null : index,
        }))

        await transactionRunner.run(async (tx) => readingAttemptRepository.insertAnswers(answers, tx))
        await readingAttemptRepository.insertAnswers([{ attemptId: other.id, isCorrect: true, questionId: questions[0].id, selectedChoiceIndex: 1 }])

        const found = await readingAttemptRepository.findAnswersByAttemptId(attempt.id)
        expect(found).toEqual(
          answers.map((answer) => ({ id: expect.any(Number), ...answer, createdAt: expect.any(Date), updatedAt: expect.any(Date) })),
        )
        expect(found.map((answer) => answer.id)).toEqual([...found.map((answer) => answer.id)].sort((left, right) => left - right))
        expect(await selectAnswers(attempt.id)).toHaveLength(3)
        expect(user.id).toBe(attempt.userId)
      })

      it("空配列なら何もせず例外にならない", async () => {
        const { attempt } = await setupInProgressAttempt()

        await expect(readingAttemptRepository.insertAnswers([])).resolves.toBeUndefined()
        expect(await readingAttemptRepository.findAnswersByAttemptId(attempt.id)).toEqual([])
      })
    })
  })

  describe("insertWordLookups / findWordLookupsWithMeaning", () => {
    describe("正常系", () => {
      it("調べた単語を保存し、用語集は文脈での意味、辞書は辞書の意味を引いて id の昇順で返す。辞書に無い語は null", async () => {
        const { attempt, glossary, passage, user } = await setupInProgressAttempt()
        const other = await insertReadingAttempt(passage.id, { userId: user.id, status: "expired" })
        await testDb.insert(dictionaryEntries).values([
          { headword: "effect", meaningJa: "結果、効果" },
          { headword: "stay in sync with", meaningJa: "辞書の意味（用語集の語は使わない）" },
        ])
        const common = { attemptId: attempt.id, passageId: passage.id, userId: user.id }
        const lookups = [
          { ...common, glossaryEntryId: glossary[0].id, lemma: "stay in sync with", source: "glossary" as const, surface: "stay in sync with" },
          { ...common, glossaryEntryId: null, lemma: "effect", source: "dictionary" as const, surface: "Effects" },
          { ...common, glossaryEntryId: null, lemma: "xyzzy", source: "dictionary" as const, surface: "xyzzy" },
        ]

        await transactionRunner.run(async (tx) => readingAttemptRepository.insertWordLookups(lookups, tx))
        await readingAttemptRepository.insertWordLookups([
          { ...common, attemptId: other.id, glossaryEntryId: null, lemma: "effect", source: "dictionary", surface: "effect" },
        ])

        expect(await readingAttemptRepository.findWordLookupsWithMeaning(attempt.id)).toEqual([
          { id: expect.any(Number), ...lookups[0], meaningJa: "〜と同期した状態を保つ", createdAt: expect.any(Date), updatedAt: expect.any(Date) },
          { id: expect.any(Number), ...lookups[1], meaningJa: "結果、効果", createdAt: expect.any(Date), updatedAt: expect.any(Date) },
          { id: expect.any(Number), ...lookups[2], meaningJa: null, createdAt: expect.any(Date), updatedAt: expect.any(Date) },
        ])
        expect(await selectWordLookups(attempt.id)).toHaveLength(3)
      })

      it("用語集の項目が消された単語は glossaryEntryId と意味が null になる", async () => {
        const { attempt, glossary, passage, user } = await setupInProgressAttempt()
        await readingAttemptRepository.insertWordLookups([
          {
            attemptId: attempt.id,
            glossaryEntryId: glossary[0].id,
            lemma: "stay in sync with",
            passageId: passage.id,
            source: "glossary",
            surface: "stay in sync with",
            userId: user.id,
          },
        ])
        await testDb.delete(passageGlossaryEntries).where(eq(passageGlossaryEntries.id, glossary[0].id))

        expect(await readingAttemptRepository.findWordLookupsWithMeaning(attempt.id)).toEqual([
          expect.objectContaining({ glossaryEntryId: null, lemma: "stay in sync with", meaningJa: null, source: "glossary" }),
        ])
      })

      it("空配列なら何もせず例外にならない", async () => {
        const { attempt } = await setupInProgressAttempt()

        await expect(readingAttemptRepository.insertWordLookups([])).resolves.toBeUndefined()
        expect(await readingAttemptRepository.findWordLookupsWithMeaning(attempt.id)).toEqual([])
      })
    })
  })

  describe("read replica と primary の振り分け", () => {
    describe("正常系", () => {
      it("fromPrimary: true の読み取りは read replica を通さずに primary から読む（replica に届かない接続先を設定しても読める）", async () => {
        const { attempt, passage, questions, user } = await setupInProgressAttempt()
        await readingAttemptRepository.insertAnswers([
          { attemptId: attempt.id, isCorrect: true, questionId: questions[0].id, selectedChoiceIndex: 1 },
        ])
        await readingAttemptRepository.insertWordLookups([
          { attemptId: attempt.id, glossaryEntryId: null, lemma: "effect", passageId: passage.id, source: "dictionary", surface: "effect", userId: user.id },
        ])
        const primary = { fromPrimary: true }

        expect(await brokenReplicaRepository.findAliveInProgress(user.id, passage.id, ALIVE_SINCE, primary)).toMatchObject({ id: attempt.id })
        expect(await brokenReplicaRepository.findByIdForUser(attempt.id, user.id, primary)).toMatchObject({ id: attempt.id })
        expect(await brokenReplicaRepository.findAnswersByAttemptId(attempt.id, primary)).toHaveLength(1)
        expect(await brokenReplicaRepository.findWordLookupsWithMeaning(attempt.id, primary)).toHaveLength(1)
      })
    })

    describe("異常系", () => {
      it("fromPrimary を付けない読み取りは read replica から読む（replica に届かないので失敗する）", async () => {
        const { attempt, passage, user } = await setupInProgressAttempt()

        await expect(brokenReplicaRepository.findAliveInProgress(user.id, passage.id, ALIVE_SINCE)).rejects.toThrow()
        await expect(brokenReplicaRepository.findByIdForUser(attempt.id, user.id)).rejects.toThrow()
      })
    })
  })
})
