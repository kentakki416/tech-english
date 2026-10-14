import type { PrismaClient } from "@repo/db"

import type { CreatePassageInput, DraftContent, PassageClaim } from "../../../src/repository"
import { PrismaPassageRepository } from "../../../src/repository/prisma"

const buildInput = (contentHash: string): CreatePassageInput => ({
  blocks: [{ lang: "ts", text: "const ref = useRef(0)", type: "code" }],
  contentHash,
  sourceCommitSha: "commit-sha",
  sourceDocumentId: 10,
  sourcePath: "docs/a.md",
  sourceRetrievedAt: new Date("2026-10-10T03:00:00.000Z"),
  title: "Refs",
  wordCount: 250,
})

const NOW = new Date("2026-10-13T03:00:00.000Z")

const CLAIM: PassageClaim = { generationStartedAt: new Date("2026-10-13T02:50:00.123Z"), id: 7 }

const CLAIM_WHERE = { id: 7, generationStartedAt: CLAIM.generationStartedAt, status: "generating" }

const buildDraftContent = (overrides: Partial<DraftContent> = {}): DraftContent => ({
  attentionReasons: [],
  blocks: [{ text: "You can opt in to retries.", translationJa: "リトライを有効にできる。", type: "paragraph" }],
  difficulty: 1,
  generationModel: "claude-sonnet-5-5-20261013",
  generationPromptVersion: "2026-10-13",
  glossary: [
    { blockIndex: 0, endOffset: 7, lemma: "you", meaningJa: "あなた", noteJa: null, partOfSpeech: "名詞", startOffset: 0, surface: "You can" },
    { blockIndex: 0, endOffset: 19, lemma: "opt in to", meaningJa: "〜を選んで有効にする", noteJa: null, partOfSpeech: "句動詞", startOffset: 8, surface: "opt in to" },
  ],
  questions: [
    {
      choices: ["e", "f", "g", "h"],
      correctChoiceIndex: 0,
      evidenceBlockIndex: 0,
      evidenceQuote: "opt in to retries",
      explanationJa: "解説",
      orderIndex: 0,
      prompt: "The phrase \"opt in to\" is closest in meaning to ...",
      targetGlossaryIndex: 1,
      type: "vocabulary",
      verificationChoiceIndex: 2,
    },
  ],
  timeLimitSeconds: 240,
  ...overrides,
})

/**
 * $queryRaw のテンプレートの SQL（値は $? にする）
 */
const readRawSql = (strings: TemplateStringsArray): string => strings.join("$?").replace(/\s+/g, " ").trim()

const createFakePrisma = (options: { queryRows?: unknown[]; updatedCount?: number } = {}) => {
  const createMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
  const count = vi.fn(async (_args: unknown) => 12)
  const findUnique = vi.fn(async (_args: unknown): Promise<{ status: string } | null> => ({ status: "draft" }))
  const updateMany = vi.fn(async (_args: unknown) => ({ count: options.updatedCount ?? 1 }))
  const queryRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => options.queryRows ?? [])
  const questionDeleteMany = vi.fn(async (_args: unknown) => ({ count: 0 }))
  const questionCreateMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
  const glossaryDeleteMany = vi.fn(async (_args: unknown) => ({ count: 0 }))
  const glossaryCreateManyAndReturn = vi.fn(async (_args: unknown) => [
    { id: 502, blockIndex: 0, endOffset: 19, startOffset: 8 },
    { id: 501, blockIndex: 0, endOffset: 7, startOffset: 0 },
  ])
  const tx = {
    passage: { updateMany },
    passageGlossaryEntry: { createManyAndReturn: glossaryCreateManyAndReturn, deleteMany: glossaryDeleteMany },
    question: { createMany: questionCreateMany, deleteMany: questionDeleteMany },
  }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return {
    count,
    createMany,
    findUnique,
    glossaryCreateManyAndReturn,
    glossaryDeleteMany,
    prisma: {
      $queryRaw: queryRaw,
      $transaction: transaction,
      passage: { count, createMany, findUnique, updateMany },
    } as unknown as PrismaClient,
    queryRaw,
    questionCreateMany,
    questionDeleteMany,
    transaction,
    updateMany,
  }
}

describe("PrismaPassageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("insertIgnoringDuplicates", () => {
    describe("正常系", () => {
      it("skipDuplicates で content_hash の重複を飛ばし、挿入した件数を返す", async () => {
        const fake = createFakePrisma()
        const inputs = [buildInput("hash-1"), buildInput("hash-2")]

        const count = await new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates(inputs)

        expect(count).toBe(1)
        expect(fake.createMany).toHaveBeenCalledWith({ data: inputs, skipDuplicates: true })
      })

      it("空配列ならクエリを投げずに 0 を返す", async () => {
        const fake = createFakePrisma()

        const count = await new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates([])

        expect(count).toBe(0)
        expect(fake.createMany).not.toHaveBeenCalled()
      })
    })

    describe("異常系", () => {
      it("Prisma が throw した場合、そのまま伝搬する", async () => {
        const fake = createFakePrisma()
        fake.createMany.mockRejectedValueOnce(new Error("db connection failed"))

        await expect(new PrismaPassageRepository(fake.prisma).insertIgnoringDuplicates([buildInput("hash-1")]))
          .rejects.toThrow("db connection failed")
      })
    })
  })

  describe("claimNextCollected", () => {
    describe("正常系", () => {
      it("Drizzle 実装と同じ UPDATE ... WHERE id IN (SELECT ... LIMIT 1 FOR UPDATE SKIP LOCKED) を $queryRaw で投げ、取った 1 行を返す", async () => {
        const blocks = [{ text: "Hello.", type: "paragraph" }]
        const fake = createFakePrisma({
          queryRows: [{
            id: 1,
            blocks,
            generation_attempt_count: 0,
            generation_started_at: NOW,
            title: "T1",
            word_count: 250,
          }],
        })

        const claimed = await new PrismaPassageRepository(fake.prisma).claimNextCollected({ now: NOW, passageId: 42 })

        expect(claimed).toEqual({ id: 1, blocks, generationAttemptCount: 0, generationStartedAt: NOW, title: "T1", wordCount: 250 })
        const [strings, ...values] = fake.queryRaw.mock.calls[0]
        const sql = readRawSql(strings)
        expect(sql).toContain("SET status = 'generating', generation_started_at = $?::timestamp(3), updated_at = $?::timestamp(3)")
        expect(sql).toContain("WHERE status = 'collected' AND ($?::integer IS NULL OR id = $?::integer)")
        expect(sql).toContain("ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED")
        expect(values).toEqual(["2026-10-13T03:00:00.000Z", "2026-10-13T03:00:00.000Z", 42, 42])
      })

      it("passageId が無ければ NULL を渡して全件を候補にし、取れる行が無ければ null を返す", async () => {
        const fake = createFakePrisma()

        expect(await new PrismaPassageRepository(fake.prisma).claimNextCollected({ now: NOW })).toBeNull()

        const [, ...values] = fake.queryRaw.mock.calls[0]
        expect(values.slice(2)).toEqual([null, null])
      })
    })
  })

  describe("countByStatus / findStatusById", () => {
    describe("正常系", () => {
      it("状態ごとの件数と、行の状態（無ければ null）を返す", async () => {
        const fake = createFakePrisma()
        const repository = new PrismaPassageRepository(fake.prisma)

        expect(await repository.countByStatus("draft")).toBe(12)
        expect(fake.count).toHaveBeenCalledWith({ where: { status: "draft" } })
        expect(await repository.findStatusById(3)).toBe("draft")
        expect(fake.findUnique).toHaveBeenCalledWith({ select: { status: true }, where: { id: 3 } })
        fake.findUnique.mockResolvedValueOnce(null)
        expect(await repository.findStatusById(4)).toBeNull()
      })
    })
  })

  describe("markRejectedByLlm / releaseClaim", () => {
    describe("正常系", () => {
      it("claim のガード付きの updateMany で更新し、0 件なら false", async () => {
        const fake = createFakePrisma()
        const repository = new PrismaPassageRepository(fake.prisma)

        const isUpdated = await repository.markRejectedByLlm(CLAIM, { generationModel: "m", generationPromptVersion: "v", reason: "目次だけ" }, NOW)
        await repository.releaseClaim(CLAIM)

        expect(isUpdated).toBe(true)
        expect(fake.updateMany).toHaveBeenNthCalledWith(1, {
          data: {
            generatedAt: NOW,
            generationError: null,
            generationModel: "m",
            generationPromptVersion: "v",
            rejectReason: "目次だけ",
            status: "rejected",
          },
          where: CLAIM_WHERE,
        })
        expect(fake.updateMany).toHaveBeenNthCalledWith(2, { data: { status: "collected" }, where: CLAIM_WHERE })
        fake.updateMany.mockResolvedValueOnce({ count: 0 })
        expect(await repository.markRejectedByLlm(CLAIM, { generationModel: "m", generationPromptVersion: "v", reason: "r" }, NOW)).toBe(false)
      })
    })
  })

  describe("recordGenerationFailure", () => {
    describe("正常系", () => {
      it("回数の +1 と状態の判定を 1 文の $queryRaw で行い、claim のガードを付ける", async () => {
        const fake = createFakePrisma({ queryRows: [{ status: "failed" }] })

        const status = await new PrismaPassageRepository(fake.prisma).recordGenerationFailure(CLAIM, { error: "boom", maxAttempts: 3 })

        expect(status).toBe("failed")
        const [strings, ...values] = fake.queryRaw.mock.calls[0]
        const sql = readRawSql(strings)
        expect(sql).toContain("generation_attempt_count = generation_attempt_count + 1")
        expect(sql).toContain("status = CASE WHEN generation_attempt_count + 1 >= $?::integer THEN 'failed' ELSE 'collected' END")
        expect(sql).toContain("WHERE id = $?::integer AND status = 'generating' AND generation_started_at = $?::timestamp(3) RETURNING status")
        expect(values[0]).toBe("boom")
        expect(values[1]).toBe(3)
        expect(values.slice(-2)).toEqual([7, "2026-10-13T02:50:00.123Z"])
      })

      it("collected に戻れば collected、0 行なら null", async () => {
        expect(await new PrismaPassageRepository(createFakePrisma({ queryRows: [{ status: "collected" }] }).prisma)
          .recordGenerationFailure(CLAIM, { error: "e", maxAttempts: 3 })).toBe("collected")
        expect(await new PrismaPassageRepository(createFakePrisma({ queryRows: [] }).prisma)
          .recordGenerationFailure(CLAIM, { error: "e", maxAttempts: 3 })).toBeNull()
      })
    })
  })

  describe("releaseStaleGenerating", () => {
    describe("正常系", () => {
      it("generating のまま startedBefore より前の行を collected に戻し、件数を返す", async () => {
        const fake = createFakePrisma({ updatedCount: 2 })
        const startedBefore = new Date("2026-10-13T02:30:00.000Z")

        const count = await new PrismaPassageRepository(fake.prisma).releaseStaleGenerating(startedBefore)

        expect(count).toBe(2)
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: { status: "collected" },
          where: { generationStartedAt: { lt: startedBefore }, status: "generating" },
        })
      })
    })
  })

  describe("saveDraft", () => {
    describe("正常系", () => {
      it("$transaction で passages を draft に更新し、設問・用語集を入れ直す（用語集の id は位置で引く）", async () => {
        const fake = createFakePrisma()
        const content = buildDraftContent()

        const isSaved = await new PrismaPassageRepository(fake.prisma).saveDraft(CLAIM, content, NOW)

        expect(isSaved).toBe(true)
        expect(fake.updateMany).toHaveBeenCalledWith({
          data: expect.objectContaining({ needsAttention: false, status: "draft", timeLimitSeconds: 240 }),
          where: CLAIM_WHERE,
        })
        expect(fake.questionDeleteMany).toHaveBeenCalledWith({ where: { passageId: 7 } })
        expect(fake.glossaryDeleteMany).toHaveBeenCalledWith({ where: { passageId: 7 } })
        expect(fake.glossaryCreateManyAndReturn).toHaveBeenCalledWith({
          data: content.glossary.map((entry) => ({ ...entry, passageId: 7 })),
          select: { id: true, blockIndex: true, endOffset: true, startOffset: true },
        })
        expect(fake.questionCreateMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ passageId: 7, targetGlossaryEntryId: 502, verificationChoiceIndex: 2 })],
        })
      })

      it("claim が古く 0 件なら、設問・用語集に触らずに false", async () => {
        const fake = createFakePrisma({ updatedCount: 0 })

        const isSaved = await new PrismaPassageRepository(fake.prisma).saveDraft(CLAIM, buildDraftContent(), NOW)

        expect(isSaved).toBe(false)
        expect(fake.questionDeleteMany).not.toHaveBeenCalled()
        expect(fake.glossaryCreateManyAndReturn).not.toHaveBeenCalled()
      })
    })
  })
})
