import { createDrizzleClient, DrizzleClient, passageGlossaryEntries, passages, questions } from "@repo/db"

import type { CreatePassageInput, DraftContent, PassageClaim } from "../../../src/repository"
import { DrizzlePassageRepository } from "../../../src/repository/drizzle"

const buildInput = (contentHash: string): CreatePassageInput => ({
  blocks: [{ text: "Refs let you remember values.", type: "paragraph" }],
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

const buildDraftContent = (overrides: Partial<DraftContent> = {}): DraftContent => ({
  attentionReasons: ["Q2：検証モデルは C を選択（正解は B）"],
  blocks: [{ text: "You can opt in to retries.", translationJa: "リトライを有効にできる。", type: "paragraph" }],
  difficulty: 2,
  generationModel: "claude-sonnet-5-5-20261013",
  generationPromptVersion: "2026-10-13",
  glossary: [
    { blockIndex: 0, endOffset: 7, lemma: "you", meaningJa: "あなた", noteJa: null, partOfSpeech: "名詞", startOffset: 0, surface: "You can" },
    { blockIndex: 0, endOffset: 19, lemma: "opt in to", meaningJa: "〜を選んで有効にする", noteJa: null, partOfSpeech: "句動詞", startOffset: 8, surface: "opt in to" },
  ],
  questions: [
    {
      choices: ["a", "b", "c", "d"],
      choicesJa: ["あ", "い", "う", "え"],
      correctChoiceIndex: 1,
      evidenceBlockIndex: 0,
      evidenceQuote: "You can opt in to retries.",
      explanationJa: "解説",
      orderIndex: 0,
      prompt: "What can you do?",
      promptJa: "何ができるか。",
      targetGlossaryIndex: null,
      type: "detail",
      verificationChoiceIndex: 1,
    },
    {
      choices: ["e", "f", "g", "h"],
      choicesJa: null,
      correctChoiceIndex: 0,
      evidenceBlockIndex: 0,
      evidenceQuote: "opt in to retries",
      explanationJa: "解説",
      orderIndex: 1,
      prompt: "The phrase \"opt in to\" is closest in meaning to ...",
      promptJa: "\"opt in to\" に最も意味が近いものはどれか。",
      targetGlossaryIndex: 1,
      type: "vocabulary",
      verificationChoiceIndex: null,
    },
  ],
  timeLimitSeconds: 300,
  ...overrides,
})

/**
 * `db.insert(table).values(rows).onConflictDoNothing(options).returning(selection)` だけを持つ DrizzleClient の偽物
 */
const createFakeDb = (returning: (_selection: unknown) => Promise<{ id: number }[]>) => {
  const returningMock = vi.fn(returning)
  const onConflictDoNothing = vi.fn((_options: unknown) => ({ returning: returningMock }))
  const values = vi.fn((_rows: unknown) => ({ onConflictDoNothing }))
  const insert = vi.fn((_table: unknown) => ({ values }))
  return { db: { insert } as unknown as DrizzleClient, insert, onConflictDoNothing, returning: returningMock, values }
}

/**
 * 記録した条件を SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

/**
 * await でき、returning などのメソッドも続けて呼べる値（Drizzle のクエリビルダーと同じ形）。Promise にすると lint が async を付けて形が崩れるので thenable にする
 */
const buildAwaitableQuery = <T>(result: T, methods: Record<string, unknown>) => ({
  ...methods,
  then: async (onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected),
})

/**
 * `db.update(table).set(values).where(condition)`（returning は任意）を記録する偽物。select はクエリを組み立てるだけの実物を使う
 */
const createFakeUpdateDb = (rows: unknown[]) => {
  const returning = vi.fn(async (_selection: unknown) => rows)
  const where = vi.fn((_condition: unknown) => buildAwaitableQuery({ rowCount: rows.length }, { returning }))
  const set = vi.fn((_values: unknown) => ({ where }))
  const update = vi.fn((_table: unknown) => ({ set }))
  const select = (...args: Parameters<DrizzleClient["select"]>) => renderClient.select(...args)
  return { db: { select, update } as unknown as DrizzleClient, returning, set, update, where }
}

/**
 * 記録した set / where を UPDATE 文にする（updated_at は Drizzle が足す）
 */
const renderUpdate = (fake: ReturnType<typeof createFakeUpdateDb>) => {
  const [values] = fake.set.mock.calls[0] as [never]
  const [condition] = fake.where.mock.calls[0] as [never]
  const query = renderClient.update(passages).set(values).where(condition).toSQL()
  return { params: query.params, sql: normalizeParams(query.sql) }
}

/**
 * claim のガード（id・状態・取得時刻）
 */
const CLAIM_CONDITION_SQL =
  "where ((\"passages\".\"id\" = $?) and (\"passages\".\"status\" = $?) and (\"passages\".\"generation_started_at\" = $?))"

const CLAIM_CONDITION_PARAMS = [7, "generating", "2026-10-13T02:50:00.123Z"]

/**
 * `db.select(selection).from(table).where(condition)` の偽物
 */
const createFakeSelectDb = (rows: unknown[]) => {
  const where = vi.fn(async (_condition: unknown) => rows)
  const from = vi.fn((_table: unknown) => ({ where }))
  const select = vi.fn((_selection: unknown) => ({ from }))
  return { db: { select } as unknown as DrizzleClient, from, select, where }
}

/**
 * saveDraft のトランザクションの偽物。update ... returning / delete ... where / insert ... values（returning は任意）を記録する
 */
const createFakeTransactionDb = (options: { glossaryRows?: unknown[]; updatedRows: unknown[] }) => {
  const updateReturning = vi.fn(async (_selection: unknown) => options.updatedRows)
  const updateWhere = vi.fn((_condition: unknown) => ({ returning: updateReturning }))
  const set = vi.fn((_values: unknown) => ({ where: updateWhere }))
  const update = vi.fn((_table: unknown) => ({ set }))
  const deleteWhere = vi.fn(async (_condition: unknown) => ({ rowCount: 0 }))
  const deleteFrom = vi.fn((_table: unknown) => ({ where: deleteWhere }))
  const insertReturning = vi.fn(async (_selection: unknown) => options.glossaryRows ?? [])
  const values = vi.fn((_rows: unknown) => buildAwaitableQuery({ rowCount: 0 }, { returning: insertReturning }))
  const insert = vi.fn((_table: unknown) => ({ values }))
  const tx = { delete: deleteFrom, insert, update }
  const transaction = vi.fn(async (callback: (_tx: unknown) => Promise<unknown>) => callback(tx))
  return {
    db: { transaction } as unknown as DrizzleClient,
    deleteFrom,
    deleteWhere,
    insert,
    insertReturning,
    set,
    transaction,
    updateWhere,
    values,
  }
}

describe("DrizzlePassageRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("insertIgnoringDuplicates", () => {
    describe("正常系", () => {
      it("content_hash の重複を ON CONFLICT DO NOTHING で飛ばし、挿入できた件数を返す", async () => {
        const fake = createFakeDb(async () => [{ id: 1 }])
        const inputs = [buildInput("hash-1"), buildInput("hash-2")]

        const count = await new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates(inputs)

        expect(count).toBe(1)
        expect(fake.insert).toHaveBeenCalledWith(passages)
        expect(fake.values).toHaveBeenCalledWith(inputs)
        expect(fake.onConflictDoNothing).toHaveBeenCalledWith({ target: passages.contentHash })
        expect(fake.returning).toHaveBeenCalledWith({ id: passages.id })
      })

      it("空配列ならクエリを投げずに 0 を返す", async () => {
        const fake = createFakeDb(async () => [])

        const count = await new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates([])

        expect(count).toBe(0)
        expect(fake.insert).not.toHaveBeenCalled()
      })
    })

    describe("異常系", () => {
      it("Drizzle が throw した場合、そのまま伝搬する", async () => {
        const fake = createFakeDb(async () => {
          throw new Error("db connection failed")
        })

        await expect(new DrizzlePassageRepository(fake.db).insertIgnoringDuplicates([buildInput("hash-1")]))
          .rejects.toThrow("db connection failed")
      })
    })
  })

  describe("claimNextCollected", () => {
    describe("正常系", () => {
      it("collected のうち最も古い 1 行を FOR UPDATE SKIP LOCKED で選び、同じ UPDATE 文で generating にする", async () => {
        const fake = createFakeUpdateDb([])

        await new DrizzlePassageRepository(fake.db).claimNextCollected({ now: NOW })

        const { params, sql } = renderUpdate(fake)
        expect(sql).toBe([
          "update \"passages\" set \"generation_started_at\" = $?, \"status\" = $?, \"updated_at\" = $?",
          " where \"passages\".\"id\" in (select \"id\" from \"passages\" where \"passages\".\"status\" = $?",
          " order by \"passages\".\"created_at\" asc, \"passages\".\"id\" asc limit $? for update skip locked)",
        ].join(""))
        expect(params[0]).toBe("2026-10-13T03:00:00.000Z")
        expect(params[1]).toBe("generating")
        expect(params.slice(3)).toEqual(["collected", 1])
      })

      it("passageId があればその行だけを候補にする", async () => {
        const fake = createFakeUpdateDb([])

        await new DrizzlePassageRepository(fake.db).claimNextCollected({ now: NOW, passageId: 42 })

        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain("where ((\"passages\".\"status\" = $?) and (\"passages\".\"id\" = $?)) order by")
        expect(params.slice(3)).toEqual(["collected", 42, 1])
      })

      it("RETURNING の行を取得時刻（claim のトークン）付きで返す", async () => {
        const blocks = [{ text: "Hello.", type: "paragraph" as const }]
        const fake = createFakeUpdateDb([{
          id: 2,
          blocks,
          generationAttemptCount: 1,
          generationStartedAt: NOW,
          title: "T2",
          wordCount: 250,
        }])

        const claimed = await new DrizzlePassageRepository(fake.db).claimNextCollected({ now: NOW })

        expect(claimed).toEqual({ id: 2, blocks, generationAttemptCount: 1, generationStartedAt: NOW, title: "T2", wordCount: 250 })
      })

      it("取れる行が無ければ null を返す", async () => {
        const fake = createFakeUpdateDb([])

        expect(await new DrizzlePassageRepository(fake.db).claimNextCollected({ now: NOW })).toBeNull()
      })
    })
  })

  describe("countByStatus", () => {
    describe("正常系", () => {
      it("状態ごとの件数を返す", async () => {
        const fake = createFakeSelectDb([{ count: 12 }])

        const count = await new DrizzlePassageRepository(fake.db).countByStatus("draft")

        expect(count).toBe(12)
        expect(fake.from).toHaveBeenCalledWith(passages)
      })
    })
  })

  describe("findGeneratedOrGeneratingTitles", () => {
    describe("正常系", () => {
      it("文書の本文候補のうち、生成中・下書き・公開済みと、生成した後に却下したものの見出しを重複を除いて返す", async () => {
        const where = vi.fn(async (_condition: unknown) => [{ title: "Refs" }, { title: "Effects" }])
        const from = vi.fn((_table: unknown) => ({ where }))
        const selectDistinct = vi.fn((_selection: unknown) => ({ from }))
        const db = { selectDistinct } as unknown as DrizzleClient

        const titles = await new DrizzlePassageRepository(db).findGeneratedOrGeneratingTitles(10)

        expect(titles).toEqual(["Refs", "Effects"])
        expect(from).toHaveBeenCalledWith(passages)
        const [condition] = where.mock.calls[0] as [never]
        const query = renderClient.select().from(passages).where(condition).toSQL()
        expect(normalizeParams(query.sql)).toContain([
          "where ((\"passages\".\"source_document_id\" = $?) and (((\"passages\".\"status\" in ($?, $?, $?))",
          " or (((\"passages\".\"status\" = $?) and ((\"passages\".\"generated_at\" is not null)))))))",
        ].join(""))
        expect(query.params).toEqual([10, "draft", "generating", "published", "rejected"])
      })
    })
  })

  describe("findStatusById", () => {
    describe("正常系", () => {
      it("行の状態を返し、行が無ければ null", async () => {
        expect(await new DrizzlePassageRepository(createFakeSelectDb([{ status: "draft" }]).db).findStatusById(1)).toBe("draft")
        expect(await new DrizzlePassageRepository(createFakeSelectDb([]).db).findStatusById(1)).toBeNull()
      })
    })
  })

  describe("markRejectedByLlm", () => {
    describe("正常系", () => {
      it("claim のガード付きで rejected にし、理由と生成の記録を残す", async () => {
        const fake = createFakeUpdateDb([{ id: 7 }])

        const isUpdated = await new DrizzlePassageRepository(fake.db).markRejectedByLlm(
          CLAIM,
          { generationModel: "claude-sonnet-5-5-20261013", generationPromptVersion: "2026-10-13", reason: "目次だけ" },
          NOW,
        )

        expect(isUpdated).toBe(true)
        expect(fake.set).toHaveBeenCalledWith({
          generatedAt: NOW,
          generationError: null,
          generationModel: "claude-sonnet-5-5-20261013",
          generationPromptVersion: "2026-10-13",
          rejectReason: "目次だけ",
          status: "rejected",
        })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain(CLAIM_CONDITION_SQL)
        expect(params.slice(-3)).toEqual(CLAIM_CONDITION_PARAMS)
      })

      it("claim が古く 0 行なら false", async () => {
        const fake = createFakeUpdateDb([])

        const isUpdated = await new DrizzlePassageRepository(fake.db).markRejectedByLlm(
          CLAIM,
          { generationModel: "m", generationPromptVersion: "v", reason: "r" },
          NOW,
        )

        expect(isUpdated).toBe(false)
      })
    })
  })

  describe("recordGenerationFailure", () => {
    describe("正常系", () => {
      it("回数の +1 と、上限に達したら failed・それ以外は collected を 1 文で更新し、更新後の状態を返す", async () => {
        const fake = createFakeUpdateDb([{ status: "failed" }])

        const status = await new DrizzlePassageRepository(fake.db).recordGenerationFailure(CLAIM, { error: "RateLimitError: 429", maxAttempts: 3 })

        expect(status).toBe("failed")
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain([
          "set \"generation_attempt_count\" = \"passages\".\"generation_attempt_count\" + 1, \"generation_error\" = $?,",
          " \"status\" = CASE WHEN \"passages\".\"generation_attempt_count\" + 1 >= $? THEN 'failed' ELSE 'collected' END,",
        ].join(""))
        expect(sql).toContain(CLAIM_CONDITION_SQL)
        expect(params.slice(0, 2)).toEqual(["RateLimitError: 429", 3])
        expect(params.slice(-3)).toEqual(CLAIM_CONDITION_PARAMS)
      })

      it("collected に戻ったら collected、claim が古く 0 行なら null", async () => {
        const repository = new DrizzlePassageRepository(createFakeUpdateDb([{ status: "collected" }]).db)
        const staleRepository = new DrizzlePassageRepository(createFakeUpdateDb([]).db)

        expect(await repository.recordGenerationFailure(CLAIM, { error: "e", maxAttempts: 3 })).toBe("collected")
        expect(await staleRepository.recordGenerationFailure(CLAIM, { error: "e", maxAttempts: 3 })).toBeNull()
      })
    })
  })

  describe("rejectCollected", () => {
    describe("正常系", () => {
      it("文書の collected のうち content_hash が keepContentHashes に無いものを、理由つきで rejected にして件数を返す", async () => {
        const fake = createFakeUpdateDb([{ id: 1 }, { id: 2 }])

        const rejectedCount = await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: ["hash-a", "hash-b"],
          reason: "切り分け直した",
          sourceDocumentIds: [10],
        })

        expect(rejectedCount).toBe(2)
        expect(fake.set).toHaveBeenCalledWith({ rejectReason: "切り分け直した", status: "rejected" })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain([
          "where ((\"passages\".\"source_document_id\" in ($?)) and (\"passages\".\"status\" = $?)",
          " and (\"passages\".\"content_hash\" not in ($?, $?)))",
        ].join(""))
        expect(params.slice(-4)).toEqual([10, "collected", "hash-a", "hash-b"])
      })

      it("keepContentHashes が空なら not in を付けず、文書の collected をすべて rejected にする", async () => {
        const fake = createFakeUpdateDb([{ id: 1 }])

        await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: [],
          reason: "対象外",
          sourceDocumentIds: [10, 11],
        })

        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain("where ((\"passages\".\"source_document_id\" in ($?, $?)) and (\"passages\".\"status\" = $?))")
        expect(sql).not.toContain("not in")
        expect(params.slice(-3)).toEqual([10, 11, "collected"])
      })

      it("sourceDocumentIds が空なら UPDATE せずに 0 を返す", async () => {
        const fake = createFakeUpdateDb([])

        const rejectedCount = await new DrizzlePassageRepository(fake.db).rejectCollected({
          keepContentHashes: [],
          reason: "対象外",
          sourceDocumentIds: [],
        })

        expect(rejectedCount).toBe(0)
        expect(fake.update).not.toHaveBeenCalled()
      })
    })
  })

  describe("releaseClaim", () => {
    describe("正常系", () => {
      it("失敗回数を変えずに、claim のガード付きで collected に戻す", async () => {
        const fake = createFakeUpdateDb([])

        await new DrizzlePassageRepository(fake.db).releaseClaim(CLAIM)

        expect(fake.set).toHaveBeenCalledWith({ status: "collected" })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain(CLAIM_CONDITION_SQL)
        expect(params.slice(-3)).toEqual(CLAIM_CONDITION_PARAMS)
      })
    })
  })

  describe("releaseStaleGenerating", () => {
    describe("正常系", () => {
      it("generating のまま startedBefore より前に取得された行を collected に戻し、件数を返す", async () => {
        const fake = createFakeUpdateDb([{ id: 1 }, { id: 2 }])

        const count = await new DrizzlePassageRepository(fake.db).releaseStaleGenerating(new Date("2026-10-13T02:30:00.000Z"))

        expect(count).toBe(2)
        expect(fake.set).toHaveBeenCalledWith({ status: "collected" })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain("where ((\"passages\".\"status\" = $?) and (\"passages\".\"generation_started_at\" < $?))")
        expect(params.slice(-2)).toEqual(["generating", "2026-10-13T02:30:00.000Z"])
      })
    })
  })

  describe("saveDraft", () => {
    describe("正常系", () => {
      it("トランザクションで passages を draft に更新し、設問・用語集を消してから入れ直す", async () => {
        const fake = createFakeTransactionDb({
          /**
           * RETURNING の順序に頼らないことを確かめるため、insert と逆の順で返す
           */
          glossaryRows: [
            { id: 502, blockIndex: 0, endOffset: 19, startOffset: 8 },
            { id: 501, blockIndex: 0, endOffset: 7, startOffset: 0 },
          ],
          updatedRows: [{ id: 7 }],
        })
        const content = buildDraftContent()

        const isSaved = await new DrizzlePassageRepository(fake.db).saveDraft(CLAIM, content, NOW)

        expect(isSaved).toBe(true)
        expect(fake.transaction).toHaveBeenCalledTimes(1)
        expect(fake.set).toHaveBeenCalledWith({
          attentionReasons: content.attentionReasons,
          blocks: content.blocks,
          difficulty: 2,
          generatedAt: NOW,
          generationError: null,
          generationModel: "claude-sonnet-5-5-20261013",
          generationPromptVersion: "2026-10-13",
          needsAttention: true,
          rejectReason: null,
          status: "draft",
          timeLimitSeconds: 300,
        })
        const [condition] = fake.updateWhere.mock.calls[0] as [never]
        const update = renderClient.update(passages).set({ status: "draft" }).where(condition).toSQL()
        expect(normalizeParams(update.sql)).toContain(CLAIM_CONDITION_SQL)
        expect(fake.deleteFrom.mock.calls.map(([table]) => table)).toEqual([questions, passageGlossaryEntries])
        expect(fake.insert.mock.calls.map(([table]) => table)).toEqual([passageGlossaryEntries, questions])
        expect(fake.values.mock.calls[0][0]).toEqual(content.glossary.map((entry) => ({ ...entry, passageId: 7 })))
        expect(fake.values.mock.calls[1][0]).toEqual([
          expect.objectContaining({
            choicesJa: ["あ", "い", "う", "え"],
            orderIndex: 0,
            passageId: 7,
            promptJa: "何ができるか。",
            targetGlossaryEntryId: null,
            verificationChoiceIndex: 1,
          }),
          expect.objectContaining({
            choicesJa: null,
            orderIndex: 1,
            passageId: 7,
            promptJa: "\"opt in to\" に最も意味が近いものはどれか。",
            targetGlossaryEntryId: 502,
            type: "vocabulary",
            verificationChoiceIndex: null,
          }),
        ])
      })

      it("要確認の理由が無ければ needs_attention = false。用語集が空なら用語集の insert をしない", async () => {
        const fake = createFakeTransactionDb({ updatedRows: [{ id: 7 }] })
        const base = buildDraftContent()
        const content = buildDraftContent({
          attentionReasons: [],
          glossary: [],
          questions: base.questions.map((question) => ({ ...question, targetGlossaryIndex: null })),
        })

        await new DrizzlePassageRepository(fake.db).saveDraft(CLAIM, content, NOW)

        expect(fake.set).toHaveBeenCalledWith(expect.objectContaining({ attentionReasons: [], needsAttention: false }))
        expect(fake.insert.mock.calls.map(([table]) => table)).toEqual([questions])
      })

      it("claim が古く 0 行なら、設問・用語集に触らずに false", async () => {
        const fake = createFakeTransactionDb({ updatedRows: [] })

        const isSaved = await new DrizzlePassageRepository(fake.db).saveDraft(CLAIM, buildDraftContent(), NOW)

        expect(isSaved).toBe(false)
        expect(fake.deleteFrom).not.toHaveBeenCalled()
        expect(fake.insert).not.toHaveBeenCalled()
      })
    })
  })
})
