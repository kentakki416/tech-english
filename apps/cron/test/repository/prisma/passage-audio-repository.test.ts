import type { PrismaClient } from "@repo/db"
import type { PassageAudioManifest, PassageBlock } from "@repo/domain"

import type { AudioClaim } from "../../../src/repository"
import { PrismaPassageAudioRepository } from "../../../src/repository/prisma"

const NOW = new Date("2026-10-13T03:00:00.000Z")

const CLAIM: AudioClaim = { generationStartedAt: new Date("2026-10-13T02:50:00.123Z"), passageId: 42 }

const CLAIM_WHERE = { generationStartedAt: CLAIM.generationStartedAt, passageId: 42, status: "generating" }

const BLOCKS: PassageBlock[] = [{ text: "Effects are an escape hatch.", type: "paragraph" }]

const TEXT_HASH = "hash:Effects are an escape hatch."

const MANIFEST: PassageAudioManifest = {
  blocks: [{ blockIndex: 0, parts: [{ durationMs: 1800, key: "passages/42/new/0-0.mp3", words: [[0, 300, 0, 7]] }] }],
}

const calculateTextHash = (blocks: PassageBlock[]): string => `hash:${blocks.map((block) => block.text).join("|")}`

/**
 * $queryRaw のテンプレートの SQL（値は $? にする）
 */
const readRawSql = (strings: TemplateStringsArray): string => strings.join("$?").replace(/\s+/g, " ").trim()

/**
 * queryResults は $queryRaw を呼んだ順に返す値
 */
const createFakePrisma = (options: { blocks?: PassageBlock[] | null; queryResults?: unknown[]; updatedCount?: number } = {}) => {
  const queryRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) =>
    options.queryResults?.[queryRaw.mock.calls.length - 1] ?? [])
  const findUnique = vi.fn(async (_args: unknown) => (options.blocks === null ? null : { blocks: options.blocks ?? BLOCKS }))
  const updateMany = vi.fn(async (_args: unknown) => ({ count: options.updatedCount ?? 1 }))
  const tx = { $queryRaw: queryRaw, passage: { findUnique }, passageAudio: { updateMany } }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return {
    findUnique,
    prisma: { $transaction: transaction, passageAudio: { updateMany } } as unknown as PrismaClient,
    queryRaw,
    transaction,
    updateMany,
  }
}

describe("PrismaPassageAudioRepository", () => {
  describe("claimTargets", () => {
    describe("正常系", () => {
      it("Drizzle 実装と同じ条件（voice が今と違う ready を含む）・順序・行ロックで選び、unnest で insert して ON CONFLICT は pending / ready だけ generating にする", async () => {
        const fake = createFakePrisma({
          queryResults: [
            [
              { blocks: BLOCKS, manifest: null, passage_id: 7, status: null, text_hash: null },
              { blocks: BLOCKS, manifest: MANIFEST, passage_id: 8, status: "ready", text_hash: "old" },
            ],
            [{ passage_id: 8 }],
          ],
        })

        const claimed = await new PrismaPassageAudioRepository(fake.prisma).claimTargets({ calculateTextHash, limit: 20, now: NOW, voiceId: "Joanna" })

        expect(fake.transaction).toHaveBeenCalledTimes(1)
        const [selectStrings, ...selectValues] = fake.queryRaw.mock.calls[0] ?? []
        const selectSql = readRawSql(selectStrings)
        expect(selectSql).toContain("WHERE passages.status = 'published'")
        expect(selectSql).toContain([
          "passage_audios.id IS NULL OR passage_audios.status = 'pending'",
          " OR (passage_audios.status = 'ready' AND passage_audios.updated_at < passages.published_at)",
          " OR (passage_audios.status = 'ready' AND passage_audios.voice_id <> $?)",
        ].join(""))
        expect(selectSql).toContain("ORDER BY passages.published_at ASC, passages.id ASC LIMIT $?::integer FOR UPDATE OF passages SKIP LOCKED")
        expect(selectValues).toEqual(["Joanna", 20])

        const [insertStrings, ...insertValues] = fake.queryRaw.mock.calls[1] ?? []
        const insertSql = readRawSql(insertStrings)
        expect(insertSql).toContain("FROM unnest($?::integer[], $?::text[]) AS target(passage_id, text_hash)")
        expect(insertSql).toContain("ON CONFLICT (passage_id) DO UPDATE SET")
        expect(insertSql).toContain("WHERE passage_audios.status IN ('pending', 'ready') RETURNING passage_id")
        expect(insertSql).not.toContain("manifest =")
        expect(insertValues).toEqual(expect.arrayContaining([[7, 8], [TEXT_HASH, TEXT_HASH], "Joanna", "2026-10-13T03:00:00.000Z"]))

        expect(claimed).toEqual([
          { blocks: BLOCKS, generationStartedAt: NOW, passageId: 8, previous: { manifest: MANIFEST, status: "ready", textHash: "old" } },
        ])
      })

      it("対象が無ければ insert しない", async () => {
        const fake = createFakePrisma({ queryResults: [[]] })

        const claimed = await new PrismaPassageAudioRepository(fake.prisma).claimTargets({ calculateTextHash, limit: 20, now: NOW, voiceId: "Joanna" })

        expect(claimed).toEqual([])
        expect(fake.queryRaw).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe("completeClaim", () => {
    describe("正常系", () => {
      it("ready：claim のガード付きで FOR UPDATE で読み、本文の hash が同じなら ready とマニフェストを書く", async () => {
        const fake = createFakePrisma({ queryResults: [[{ id: 1 }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: TEXT_HASH, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("ready")
        const [lockStrings, ...lockValues] = fake.queryRaw.mock.calls[0] ?? []
        expect(readRawSql(lockStrings)).toBe(
          "SELECT id FROM passage_audios WHERE passage_id = $?::integer AND status = 'generating' AND generation_started_at = $?::timestamp(3) FOR UPDATE",
        )
        expect(lockValues).toEqual([42, "2026-10-13T02:50:00.123Z"])
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: {
            attemptCount: 0,
            billedCharacters: 120,
            generatedAt: NOW,
            generationStartedAt: null,
            lastError: null,
            manifest: MANIFEST,
            status: "ready",
            textHash: TEXT_HASH,
            updatedAt: NOW,
            voiceId: "Joanna",
          },
          where: CLAIM_WHERE,
        })
      })

      it("unchanged：status を ready にして updated_at を進め、失敗の回数とエラーを消す（manifest・text_hash・generated_at は前の成功のまま）", async () => {
        const fake = createFakePrisma({ queryResults: [[{ id: 1 }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { kind: "unchanged", textHash: TEXT_HASH },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("unchanged")
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { attemptCount: 0, generationStartedAt: null, lastError: null, status: "ready", updatedAt: NOW },
          where: CLAIM_WHERE,
        })
      })

      it("今の本文の hash が違えば pending に戻して text_changed", async () => {
        const fake = createFakePrisma({ blocks: [{ text: "Edited.", type: "paragraph" }], queryResults: [[{ id: 1 }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { kind: "unchanged", textHash: TEXT_HASH },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("text_changed")
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { generationStartedAt: null, status: "pending", updatedAt: NOW },
          where: CLAIM_WHERE,
        })
      })

      it("failed：回数の +1 と上限での failed を 1 文で更新し、manifest と text_hash は更新しない", async () => {
        const fake = createFakePrisma({ queryResults: [[{ id: 1 }], [{ status: "failed" }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("failed")
        const [updateStrings, ...updateValues] = fake.queryRaw.mock.calls[1] ?? []
        const updateSql = readRawSql(updateStrings)
        expect(updateSql).toContain("attempt_count = attempt_count + 1")
        expect(updateSql).toContain("status = CASE WHEN attempt_count + 1 >= $?::integer THEN 'failed' ELSE 'pending' END")
        expect(updateSql).toContain("WHERE passage_id = $?::integer AND status = 'generating' AND generation_started_at = $?::timestamp(3)")
        expect(updateSql).not.toContain("manifest")
        expect(updateSql).not.toContain("text_hash")
        expect(updateValues).toEqual(["ThrottlingException: Rate exceeded", 3, "2026-10-13T03:00:00.000Z", 42, "2026-10-13T02:50:00.123Z"])
        expect(fake.findUnique).not.toHaveBeenCalled()
      })

      it("failed で上限に達していなければ retry_later", async () => {
        const fake = createFakePrisma({ queryResults: [[{ id: 1 }], [{ status: "pending" }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { error: "e", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("retry_later")
      })
    })

    describe("異常系", () => {
      it("ガードに当たらなければ lost_claim で何も書かない", async () => {
        const fake = createFakePrisma({ queryResults: [[]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { kind: "unchanged", textHash: TEXT_HASH },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("lost_claim")
        expect(fake.updateMany).not.toHaveBeenCalled()
        expect(fake.findUnique).not.toHaveBeenCalled()
      })
    })
  })

  describe("releaseClaim", () => {
    describe("正常系", () => {
      it("失敗回数を変えずに、claim のガード付きで pending に戻す", async () => {
        const fake = createFakePrisma()

        await new PrismaPassageAudioRepository(fake.prisma).releaseClaim(CLAIM)

        expect(fake.updateMany).toHaveBeenCalledWith({ data: { generationStartedAt: null, status: "pending" }, where: CLAIM_WHERE })
      })
    })
  })

  describe("releaseStaleGenerating", () => {
    describe("正常系", () => {
      it("generating のまま startedBefore より前に確保された行を pending に戻し、件数を返す", async () => {
        const fake = createFakePrisma({ updatedCount: 2 })
        const startedBefore = new Date("2026-10-13T02:30:00.000Z")

        const count = await new PrismaPassageAudioRepository(fake.prisma).releaseStaleGenerating(startedBefore)

        expect(count).toBe(2)
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { generationStartedAt: null, status: "pending" },
          where: { generationStartedAt: { lt: startedBefore }, status: "generating" },
        })
      })
    })
  })
})
