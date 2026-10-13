import { eq, passageAudios } from "@repo/db"
import type { AudioStatus } from "@repo/domain"

import { DrizzlePassageAudioRepository } from "../../src/repository/drizzle/passage-audio-repository"
import type { PassageAudioRepository } from "../../src/repository/passage-audio-repository"
import { PrismaPassageAudioRepository } from "../../src/repository/prisma/passage-audio-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import { insertGeneratedPassage, insertPassageAudio } from "../fixture/passage"
import { AUDIO_TEXT_HASH, buildAudioManifest } from "../fixture/passage-audio"

/**
 * Prisma / Drizzle の両実装が PassageAudioRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する
 */
const implementations: [string, PassageAudioRepository][] = [
  ["Drizzle", new DrizzlePassageAudioRepository(testDb)],
  ["Prisma", new PrismaPassageAudioRepository(testPrisma)],
]

const PUBLISHED_AT = new Date("2026-10-12T03:00:00.000Z")

const insertPublishedPassage = async () => {
  const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "published" })
  return passage
}

const selectAudio = async (passageId: number) => {
  const [row] = await testDb.select().from(passageAudios).where(eq(passageAudios.passageId, passageId))
  return row
}

/**
 * 状態ごとに CHECK 制約を満たす列
 */
const buildStatusValues = (status: AudioStatus) => ({
  generationStartedAt: status === "generating" ? new Date("2026-10-12T05:00:00.000Z") : null,
  status,
})

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s PassageAudioRepository", (_name, passageAudioRepository) => {
  describe("findByPassageId", () => {
    describe("正常系", () => {
      it("音声の行と問題の状態・公開日時を返し、マニフェストは書いたとおりに読める", async () => {
        const passage = await insertPublishedPassage()
        const audio = await insertPassageAudio(passage.id)

        const found = await passageAudioRepository.findByPassageId(passage.id)

        expect(found).toEqual({
          audio: {
            id: audio.id,
            attemptCount: 0,
            billedCharacters: 4800,
            generatedAt: new Date("2026-10-12T04:00:00.000Z"),
            generationStartedAt: null,
            lastError: null,
            manifest: buildAudioManifest(passage.id),
            passageId: passage.id,
            status: "ready",
            textHash: AUDIO_TEXT_HASH,
            voiceId: "Joanna",
            createdAt: audio.createdAt,
            updatedAt: new Date("2026-10-12T04:00:00.000Z"),
          },
          passage: { publishedAt: PUBLISHED_AT, status: "published" },
        })
      })

      it("音声の行が無い問題は audio: null と問題の状態・公開日時を返す", async () => {
        const passage = await insertPublishedPassage()

        expect(await passageAudioRepository.findByPassageId(passage.id)).toEqual({
          audio: null,
          passage: { publishedAt: PUBLISHED_AT, status: "published" },
        })
      })

      it("下書きの問題は状態が draft で公開日時が null", async () => {
        const { passage } = await insertGeneratedPassage()

        expect(await passageAudioRepository.findByPassageId(passage.id)).toEqual({ audio: null, passage: { publishedAt: null, status: "draft" } })
      })

      it("非公開に戻した問題は、公開日時が残ったまま状態が draft（api はこれで ready の音声を pending にする）", async () => {
        const { passage } = await insertGeneratedPassage({ publishedAt: PUBLISHED_AT, status: "draft" })
        await insertPassageAudio(passage.id)

        const found = await passageAudioRepository.findByPassageId(passage.id)

        expect(found?.passage).toEqual({ publishedAt: PUBLISHED_AT, status: "draft" })
        expect(found?.audio?.status).toBe("ready")
      })
    })

    describe("異常系", () => {
      it("存在しない問題は null を返す", async () => {
        expect(await passageAudioRepository.findByPassageId(999999)).toBeNull()
      })
    })
  })

  describe("resetFailed", () => {
    describe("正常系", () => {
      it("failed の行を pending に戻し、attempt_count = 0・last_error = null にして true を返す。マニフェストは残す", async () => {
        const passage = await insertPublishedPassage()
        await insertPassageAudio(passage.id, {
          attemptCount: 3,
          lastError: "ServiceFailureException: Polly is unavailable",
          status: "failed",
        })

        expect(await passageAudioRepository.resetFailed(passage.id)).toBe(true)

        const row = await selectAudio(passage.id)
        expect(row).toMatchObject({
          attemptCount: 0,
          lastError: null,
          manifest: buildAudioManifest(passage.id),
          status: "pending",
          textHash: AUDIO_TEXT_HASH,
        })
        expect(row?.updatedAt.getTime()).toBeGreaterThan(new Date("2026-10-12T04:00:00.000Z").getTime())
      })

      it("ほかの問題の音声は変えない", async () => {
        const passage = await insertPublishedPassage()
        const other = await insertPublishedPassage()
        await insertPassageAudio(passage.id, { attemptCount: 3, lastError: "error", status: "failed" })
        await insertPassageAudio(other.id, { attemptCount: 3, lastError: "error", status: "failed" })

        await passageAudioRepository.resetFailed(passage.id)

        expect(await selectAudio(other.id)).toMatchObject({ attemptCount: 3, lastError: "error", status: "failed" })
      })
    })

    describe("異常系", () => {
      it.each<AudioStatus>(["pending", "generating", "ready"])("%s の行は変えずに false を返す", async (status) => {
        const passage = await insertPublishedPassage()
        await insertPassageAudio(passage.id, { attemptCount: 2, lastError: "error", ...buildStatusValues(status) })

        expect(await passageAudioRepository.resetFailed(passage.id)).toBe(false)

        expect(await selectAudio(passage.id)).toMatchObject({ attemptCount: 2, lastError: "error", status })
      })

      it("音声の行が無い問題・存在しない問題は false を返す", async () => {
        const passage = await insertPublishedPassage()

        expect(await passageAudioRepository.resetFailed(passage.id)).toBe(false)
        expect(await passageAudioRepository.resetFailed(999999)).toBe(false)
        expect(await selectAudio(passage.id)).toBeUndefined()
      })
    })
  })
})
