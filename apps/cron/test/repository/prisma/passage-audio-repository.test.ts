import type { PrismaClient } from "@repo/db"
import type { PassageAudioManifest, PassageBlock } from "@repo/domain"

import type { AudioClaim } from "../../../src/repository"
import { PrismaPassageAudioRepository } from "../../../src/repository/prisma"

const NOW = new Date("2026-10-13T03:00:00.000Z")

const CLAIM: AudioClaim = { claimedStatus: "generating", generationStartedAt: new Date("2026-10-13T02:50:00.123Z"), passageId: 42 }

const READY_CLAIM: AudioClaim = { ...CLAIM, claimedStatus: "ready" }

const CLAIM_WHERE = { generationStartedAt: CLAIM.generationStartedAt, passageId: 42, status: "generating" }

const STALE_BEFORE = new Date("2026-10-13T02:30:00.000Z")

const CLAIM_INPUT = { limit: 20, maxAttempts: 3, now: NOW, staleBefore: STALE_BEFORE, voiceId: "Joanna" }

/**
 * select の候補の行（列名は snake_case。passage_audios の列は行が無ければ null）
 */
const buildCandidateRow = (overrides: Record<string, unknown> = {}) => ({
  blocks: BLOCKS,
  manifest: null,
  passage_id: 7,
  published_at: new Date("2026-10-12T03:00:00.000Z"),
  regenerate_requested_at: null,
  status: null,
  text_hash: null,
  updated_at: null,
  ...overrides,
})

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
const createFakePrisma = (
  options: { blocks?: PassageBlock[] | null; findManyResult?: unknown[]; queryResults?: unknown[]; updatedCount?: number } = {},
) => {
  const queryRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) =>
    options.queryResults?.[queryRaw.mock.calls.length - 1] ?? [])
  const executeRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => 1)
  const findUnique = vi.fn(async (_args: unknown) => (options.blocks === null ? null : { blocks: options.blocks ?? BLOCKS }))
  const findMany = vi.fn(async (_args: unknown) => options.findManyResult ?? [])
  const deleteMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
  const updateMany = vi.fn(async (_args: unknown) => ({ count: options.updatedCount ?? 1 }))
  const passageAudio = { deleteMany, findMany, updateMany }
  const tx = { $queryRaw: queryRaw, passage: { findUnique }, passageAudio }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return {
    deleteMany,
    executeRaw,
    findMany,
    findUnique,
    prisma: { $executeRaw: executeRaw, $transaction: transaction, passageAudio } as unknown as PrismaClient,
    queryRaw,
    transaction,
    updateMany,
  }
}

describe("PrismaPassageAudioRepository", () => {
  describe("claimTargets", () => {
    describe("正常系", () => {
      it("Drizzle 実装と同じ条件（確保中でない ready・voice が今と違う・作り直しの依頼・失敗の上限）・順序・行ロックで選び、unnest で insert して ON CONFLICT は pending か確保中でない ready だけ generating にする", async () => {
        const fake = createFakePrisma({
          queryResults: [
            [
              buildCandidateRow({ passage_id: 7 }),
              buildCandidateRow({
                manifest: MANIFEST,
                passage_id: 8,
                status: "ready",
                text_hash: "old",
                updated_at: new Date("2026-10-12T02:00:00.000Z"),
              }),
            ],
            [{ passage_id: 8 }],
          ],
        })

        const claimed = await new PrismaPassageAudioRepository(fake.prisma).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(fake.transaction).toHaveBeenCalledTimes(1)
        const [selectStrings, ...selectValues] = fake.queryRaw.mock.calls[0] ?? []
        const selectSql = readRawSql(selectStrings)
        expect(selectSql).toContain("passage_audios.regenerate_requested_at, passage_audios.status, passage_audios.text_hash, passage_audios.updated_at")
        expect(selectSql).toContain("WHERE passages.status = 'published'")
        expect(selectSql).toContain([
          "passage_audios.id IS NULL OR passage_audios.status = 'pending'",
          " OR ( passage_audios.status = 'ready'",
          " AND (passage_audios.generation_started_at IS NULL OR passage_audios.generation_started_at < $?::timestamp(3))",
          " AND ( passage_audios.updated_at < passages.published_at",
          " OR ( (passage_audios.voice_id <> $? OR passage_audios.regenerate_requested_at IS NOT NULL)",
          " AND passage_audios.attempt_count < $?::integer ) ) )",
        ].join(""))
        expect(selectSql).toContain("ORDER BY passages.published_at ASC, passages.id ASC LIMIT $?::integer FOR UPDATE OF passages SKIP LOCKED")
        expect(selectValues).toEqual(["2026-10-13T02:30:00.000Z", "Joanna", 3, 20])

        const [insertStrings, ...insertValues] = fake.queryRaw.mock.calls[1] ?? []
        const insertSql = readRawSql(insertStrings)
        expect(insertSql).toContain("FROM unnest($?::integer[], $?::text[]) AS target(passage_id, text_hash)")
        expect(insertSql).toContain("ON CONFLICT (passage_id) DO UPDATE SET")
        expect(insertSql).toContain([
          "WHERE passage_audios.status = 'pending' OR ( passage_audios.status = 'ready'",
          " AND (passage_audios.generation_started_at IS NULL OR passage_audios.generation_started_at < $?::timestamp(3)) )",
          " RETURNING passage_id",
        ].join(""))
        expect(insertSql).not.toContain("manifest =")
        expect(insertValues).toEqual(expect.arrayContaining([[7, 8], [TEXT_HASH, TEXT_HASH], "Joanna", "2026-10-13T03:00:00.000Z"]))
        /**
         * ready のまま確保する行が無ければ update しない
         */
        expect(fake.queryRaw).toHaveBeenCalledTimes(2)

        expect(claimed).toEqual([{
          blocks: BLOCKS,
          claimedStatus: "generating",
          generationStartedAt: NOW,
          isRegenerationRequested: false,
          passageId: 8,
          previous: { manifest: MANIFEST, status: "ready", textHash: "old" },
        }])
      })

      it("公開し直されていない ready（voice の変更・作り直しの依頼）は、ready のまま generation_started_at だけを入れる（updated_at は変えない）", async () => {
        const fake = createFakePrisma({
          queryResults: [
            [buildCandidateRow({
              manifest: MANIFEST,
              passage_id: 8,
              regenerate_requested_at: new Date("2026-10-13T01:00:00.000Z"),
              status: "ready",
              text_hash: "old",
              updated_at: new Date("2026-10-12T04:00:00.000Z"),
            })],
            [{ passage_id: 8 }],
          ],
        })

        const claimed = await new PrismaPassageAudioRepository(fake.prisma).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        const [updateStrings, ...updateValues] = fake.queryRaw.mock.calls[1] ?? []
        expect(readRawSql(updateStrings)).toBe([
          "UPDATE passage_audios SET generation_started_at = $?::timestamp(3)",
          " WHERE passage_id = ANY($?::integer[]) AND status = 'ready'",
          " AND (generation_started_at IS NULL OR generation_started_at < $?::timestamp(3))",
          " AND (voice_id <> $? OR regenerate_requested_at IS NOT NULL)",
          " AND attempt_count < $?::integer RETURNING passage_id",
        ].join(""))
        expect(updateValues).toEqual(["2026-10-13T03:00:00.000Z", [8], "2026-10-13T02:30:00.000Z", "Joanna", 3])
        expect(claimed).toEqual([{
          blocks: BLOCKS,
          claimedStatus: "ready",
          generationStartedAt: NOW,
          isRegenerationRequested: true,
          passageId: 8,
          previous: { manifest: MANIFEST, status: "ready", textHash: "old" },
        }])
      })

      it("対象が無ければ insert も update もしない", async () => {
        const fake = createFakePrisma({ queryResults: [[]] })

        const claimed = await new PrismaPassageAudioRepository(fake.prisma).claimTargets({ calculateTextHash, ...CLAIM_INPUT })

        expect(claimed).toEqual([])
        expect(fake.queryRaw).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe("completeClaim", () => {
    describe("正常系", () => {
      it("ready：claim のガード付きで FOR UPDATE で読み、本文の hash が同じなら ready とマニフェストを書く", async () => {
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: null }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: TEXT_HASH, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("ready")
        const [lockStrings, ...lockValues] = fake.queryRaw.mock.calls[0] ?? []
        expect(readRawSql(lockStrings)).toBe(
          "SELECT regenerate_requested_at FROM passage_audios WHERE passage_id = $?::integer AND status = $? AND generation_started_at = $?::timestamp(3) FOR UPDATE",
        )
        expect(lockValues).toEqual([42, "generating", "2026-10-13T02:50:00.123Z"])
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: {
            attemptCount: 0,
            billedCharacters: 120,
            generatedAt: NOW,
            generationStartedAt: null,
            lastError: null,
            manifest: MANIFEST,
            regenerateRequestedAt: null,
            status: "ready",
            textHash: TEXT_HASH,
            updatedAt: NOW,
            voiceId: "Joanna",
          },
          where: CLAIM_WHERE,
        })
      })

      it.each([
        ["確保の時刻より前に出された作り直しの依頼は消す", new Date("2026-10-13T02:00:00.000Z"), null],
        ["確保の後に出された依頼は残す", new Date("2026-10-13T02:55:00.000Z"), new Date("2026-10-13T02:55:00.000Z")],
      ])("ready のまま確保した行の ready：%s（ガードは ready）", async (_label, requestedAt, expected) => {
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: requestedAt }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          READY_CLAIM,
          { billedCharacters: 120, kind: "ready", manifest: MANIFEST, textHash: TEXT_HASH, voiceId: "Joanna" },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("ready")
        expect(fake.queryRaw.mock.calls[0]?.slice(1)).toEqual([42, "ready", "2026-10-13T02:50:00.123Z"])
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: expect.objectContaining({ regenerateRequestedAt: expected, status: "ready" }),
          where: { ...CLAIM_WHERE, status: "ready" },
        })
      })

      it("unchanged：status を ready にして updated_at を進め、失敗の回数とエラーを消す（manifest・text_hash・generated_at は前の成功のまま）", async () => {
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: null }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { kind: "unchanged", textHash: TEXT_HASH },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("unchanged")
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { attemptCount: 0, generationStartedAt: null, lastError: null, regenerateRequestedAt: null, status: "ready", updatedAt: NOW },
          where: CLAIM_WHERE,
        })
      })

      it("今の本文の hash が違えば pending に戻して text_changed", async () => {
        const fake = createFakePrisma({ blocks: [{ text: "Edited.", type: "paragraph" }], queryResults: [[{ regenerate_requested_at: null }]] })

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
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: null }], [{ status: "failed" }]] })

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
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: null }], [{ status: "pending" }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          CLAIM,
          { error: "e", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe("retry_later")
      })

      it.each([
        [1, "retry_later"],
        [3, "failed"],
      ] as const)("ready のまま確保した行の失敗：状態と updated_at を変えずに回数を +1 する（更新後の回数 %i → %s）", async (attemptCount, expected) => {
        const fake = createFakePrisma({ queryResults: [[{ regenerate_requested_at: null }], [{ attempt_count: attemptCount }]] })

        const result = await new PrismaPassageAudioRepository(fake.prisma).completeClaim(
          READY_CLAIM,
          { error: "ThrottlingException: Rate exceeded", kind: "failed", maxAttempts: 3 },
          { calculateTextHash, now: NOW },
        )

        expect(result).toBe(expected)
        const [updateStrings, ...updateValues] = fake.queryRaw.mock.calls[1] ?? []
        const updateSql = readRawSql(updateStrings)
        expect(updateSql).toBe([
          "UPDATE passage_audios SET attempt_count = attempt_count + 1, generation_started_at = NULL, last_error = $?",
          " WHERE passage_id = $?::integer AND status = 'ready' AND generation_started_at = $?::timestamp(3) RETURNING attempt_count",
        ].join(""))
        expect(updateValues).toEqual(["ThrottlingException: Rate exceeded", 42, "2026-10-13T02:50:00.123Z"])
        expect(fake.updateMany).not.toHaveBeenCalled()
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

  describe("releaseClaim（ready のまま確保した行）", () => {
    describe("正常系", () => {
      it("$executeRaw で generation_started_at だけを null にする（updateMany は updated_at を進めるので使わない）", async () => {
        const fake = createFakePrisma()

        await new PrismaPassageAudioRepository(fake.prisma).releaseClaim(READY_CLAIM)

        const [strings, ...values] = fake.executeRaw.mock.calls[0] ?? []
        expect(readRawSql(strings)).toBe(
          "UPDATE passage_audios SET generation_started_at = NULL WHERE passage_id = $?::integer AND status = 'ready' AND generation_started_at = $?::timestamp(3)",
        )
        expect(values).toEqual([42, "2026-10-13T02:50:00.123Z"])
        expect(fake.updateMany).not.toHaveBeenCalled()
      })
    })
  })

  describe("findRejected", () => {
    describe("正常系", () => {
      it("却下された問題の音声のうち、確保中でない行の passage_id とマニフェストを passage_id の順に返す", async () => {
        const fake = createFakePrisma({ findManyResult: [{ manifest: MANIFEST, passageId: 3 }] })

        const found = await new PrismaPassageAudioRepository(fake.prisma).findRejected(STALE_BEFORE)

        expect(found).toEqual([{ manifest: MANIFEST, passageId: 3 }])
        expect(fake.findMany).toHaveBeenCalledWith({
          orderBy: { passageId: "asc" },
          select: { manifest: true, passageId: true },
          where: {
            OR: [{ generationStartedAt: null }, { generationStartedAt: { lt: STALE_BEFORE } }],
            passage: { status: "rejected" },
          },
        })
      })
    })
  })

  describe("deleteByPassageId", () => {
    describe("正常系", () => {
      it("問題の音声の行を消す", async () => {
        const fake = createFakePrisma()

        await new PrismaPassageAudioRepository(fake.prisma).deleteByPassageId(42)

        expect(fake.deleteMany).toHaveBeenCalledWith({ where: { passageId: 42 } })
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
