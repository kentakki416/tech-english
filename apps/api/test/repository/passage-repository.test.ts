import { asc, eq, passageGlossaryEntries, passages, questions } from "@repo/db"

import { DrizzlePassageRepository } from "../../src/repository/drizzle/passage-repository"
import type { AdminPassageListQuery, DraftEditContent, PassageRepository } from "../../src/repository/passage-repository"
import { PrismaPassageRepository } from "../../src/repository/prisma/passage-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb, testPrisma } from "../controller/setup"
import {
  insertGeneratedPassage,
  insertPassage,
  insertPassageContent,
  insertPassageDocument,
  insertPassageSource,
  insertReadingAttempt,
} from "../fixture/passage"
import { PASSAGE_BLOCKS } from "../fixture/passage-content"

/**
 * Prisma / Drizzle の両実装が PassageRepository として同じ振る舞いをすることを確かめる。
 * DI で使うのは Drizzle 実装だが、Prisma 実装へ戻せる状態を保つために両方を検証する。
 */
const implementations: [string, PassageRepository][] = [
  ["Drizzle", new DrizzlePassageRepository(testDb)],
  ["Prisma", new PrismaPassageRepository(testPrisma)],
]

type GlossaryRow = typeof passageGlossaryEntries.$inferSelect
type QuestionRow = typeof questions.$inferSelect

const at = (iso: string): Date => new Date(iso)

const selectPassage = async (id: number) => {
  const [row] = await testDb.select().from(passages).where(eq(passages.id, id))
  return row
}

const selectQuestions = async (passageId: number) =>
  testDb.select().from(questions).where(eq(questions.passageId, passageId)).orderBy(asc(questions.orderIndex))

const selectGlossary = async (passageId: number) =>
  testDb
    .select()
    .from(passageGlossaryEntries)
    .where(eq(passageGlossaryEntries.passageId, passageId))
    .orderBy(asc(passageGlossaryEntries.blockIndex), asc(passageGlossaryEntries.startOffset))

/**
 * 保存済みの内容をそのまま置き換える DraftEditContent
 */
const buildUnchangedContent = (glossary: GlossaryRow[], questionRows: QuestionRow[]): DraftEditContent => ({
  blocks: PASSAGE_BLOCKS,
  difficulty: 2,
  glossary: glossary.map((entry) => ({
    id: entry.id,
    blockIndex: entry.blockIndex,
    endOffset: entry.endOffset,
    lemma: entry.lemma,
    meaningJa: entry.meaningJa,
    noteJa: entry.noteJa,
    partOfSpeech: entry.partOfSpeech,
    startOffset: entry.startOffset,
    surface: entry.surface,
  })),
  questions: questionRows.map((question) => ({
    id: question.id,
    choices: question.choices,
    correctChoiceIndex: question.correctChoiceIndex,
    evidenceBlockIndex: question.evidenceBlockIndex,
    evidenceQuote: question.evidenceQuote,
    explanationJa: question.explanationJa,
    orderIndex: question.orderIndex,
    prompt: question.prompt,
    targetGlossaryIndex: question.targetGlossaryEntryId === null
      ? null
      : glossary.findIndex((entry) => entry.id === question.targetGlossaryEntryId),
    type: question.type,
  })),
  timeLimitSeconds: 180,
  title: "Synchronizing with Effects",
})

/**
 * cursor をたどって全ページを読む（各ページは limit + 1 件まで返るので、limit 件だけ使って次の cursor を作る）
 */
const readAllPages = async (
  passageRepository: PassageRepository,
  query: Omit<AdminPassageListQuery, "cursor">,
): Promise<number[][]> => {
  const pages: number[][] = []
  let cursor: AdminPassageListQuery["cursor"] = null
  for (;;) {
    const rows = await passageRepository.findAdminList({ ...query, cursor })
    const page = rows.slice(0, query.limit)
    pages.push(page.map((row) => row.passage.id))
    const last = page[page.length - 1]
    if (rows.length <= query.limit || !last) return pages
    cursor = { id: last.passage.id, needsAttention: last.passage.needsAttention, updatedAt: last.passage.updatedAt }
  }
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe.each(implementations)("%s PassageRepository", (_name, passageRepository) => {
  describe("findAdminDetail", () => {
    describe("正常系", () => {
      it("問題・ソース・用語集（位置の順）・設問（order_index の順）・挑戦の件数を返す", async () => {
        const { glossary, passage, questions: questionRows, source } = await insertGeneratedPassage({ needsAttention: true })
        await insertReadingAttempt(passage.id)

        const detail = await passageRepository.findAdminDetail(passage.id)

        expect(detail).toEqual({
          attemptCount: 1,
          glossary: glossary.map((entry) => ({ ...entry })),
          passage: {
            ...passage,
            attentionReasons: [],
            blocks: PASSAGE_BLOCKS,
          },
          questions: questionRows.map((question) => ({ ...question })),
          source: { id: source.id, name: "React 公式ドキュメント" },
        })
        expect(detail?.glossary.map((entry) => entry.surface)).toEqual(["stay in sync with", "escape hatch", "opt out of"])
        expect(detail?.questions.map((question) => question.orderIndex)).toEqual([0, 1, 2])
      })
    })

    describe("異常系", () => {
      it("存在しなければ null を返す", async () => {
        expect(await passageRepository.findAdminDetail(999)).toBeNull()
      })
    })
  })

  describe("findAdminList", () => {
    describe("正常系", () => {
      it("draft は「要確認 → 更新が古い順（同時刻は id の昇順）」、limit + 1 件まで返す", async () => {
        const source = await insertPassageSource()
        const document = await insertPassageDocument(source.id)
        const newerAttention = await insertPassage(document.id, { needsAttention: true, updatedAt: at("2026-10-12T03:00:00.000Z") })
        const old = await insertPassage(document.id, { updatedAt: at("2026-10-10T03:00:00.000Z") })
        const olderAttention = await insertPassage(document.id, { needsAttention: true, updatedAt: at("2026-10-11T03:00:00.000Z") })
        const sameTimeFirst = await insertPassage(document.id, { updatedAt: at("2026-10-11T03:00:00.000Z") })
        const sameTimeSecond = await insertPassage(document.id, { updatedAt: at("2026-10-11T03:00:00.000Z") })
        await insertPassage(document.id, { status: "published", updatedAt: at("2026-10-09T03:00:00.000Z") })

        const rows = await passageRepository.findAdminList({ cursor: null, limit: 10, status: "draft" })

        expect(rows.map((row) => row.passage.id)).toEqual([
          olderAttention.id,
          newerAttention.id,
          old.id,
          sameTimeFirst.id,
          sameTimeSecond.id,
        ])
        expect(await passageRepository.findAdminList({ cursor: null, limit: 2, status: "draft" })).toHaveLength(3)
      })

      it("draft 以外は「更新が新しい順（同時刻は id の降順）」", async () => {
        const source = await insertPassageSource()
        const document = await insertPassageDocument(source.id)
        const oldest = await insertPassage(document.id, { status: "published", updatedAt: at("2026-10-10T03:00:00.000Z") })
        const newest = await insertPassage(document.id, { needsAttention: true, status: "published", updatedAt: at("2026-10-12T03:00:00.000Z") })
        const sameTimeFirst = await insertPassage(document.id, { status: "published", updatedAt: at("2026-10-11T03:00:00.000Z") })
        const sameTimeSecond = await insertPassage(document.id, { status: "published", updatedAt: at("2026-10-11T03:00:00.000Z") })

        const rows = await passageRepository.findAdminList({ cursor: null, limit: 10, status: "published" })

        expect(rows.map((row) => row.passage.id)).toEqual([newest.id, sameTimeSecond.id, sameTimeFirst.id, oldest.id])
      })

      it.each([
        ["draft", "draft" as const],
        ["published", "published" as const],
      ])("%s を cursor でたどると、2 ページ目以降が重複・欠落なく続く", async (_label, status) => {
        const source = await insertPassageSource()
        const document = await insertPassageDocument(source.id)
        const times = ["2026-10-10", "2026-10-11", "2026-10-11", "2026-10-12", "2026-10-12"]
        for (const [index, day] of times.entries()) {
          await insertPassage(document.id, { needsAttention: index % 2 === 0, status, updatedAt: at(`${day}T03:00:00.000Z`) })
        }
        const all = (await passageRepository.findAdminList({ cursor: null, limit: 10, status })).map((row) => row.passage.id)

        const pages = await readAllPages(passageRepository, { limit: 2, status })

        expect(pages.map((page) => page.length)).toEqual([2, 2, 1])
        expect(pages.flat()).toEqual(all)
        expect(new Set(pages.flat()).size).toBe(5)
      })

      it("source_id と needs_attention で絞り込める", async () => {
        const react = await insertPassageSource()
        const go = await insertPassageSource({ name: "Go 公式ドキュメント" })
        const reactDocument = await insertPassageDocument(react.id)
        const goDocument = await insertPassageDocument(go.id, "doc/effective_go.md")
        const reactAttention = await insertPassage(reactDocument.id, { needsAttention: true })
        const reactPlain = await insertPassage(reactDocument.id)
        const goAttention = await insertPassage(goDocument.id, { needsAttention: true })

        const bySource = await passageRepository.findAdminList({ cursor: null, limit: 10, sourceId: go.id, status: "draft" })
        const byAttention = await passageRepository.findAdminList({ cursor: null, limit: 10, needsAttention: false, status: "draft" })
        const byBoth = await passageRepository.findAdminList({
          cursor: null,
          limit: 10,
          needsAttention: true,
          sourceId: react.id,
          status: "draft",
        })

        expect(bySource.map((row) => [row.passage.id, row.source])).toEqual([[goAttention.id, { id: go.id, name: "Go 公式ドキュメント" }]])
        expect(byAttention.map((row) => row.passage.id)).toEqual([reactPlain.id])
        expect(byBoth.map((row) => row.passage.id)).toEqual([reactAttention.id])
      })

      it("attemptCount（状態を問わない挑戦の件数）と questionCount を数える", async () => {
        const { document, passage } = await insertGeneratedPassage()
        await insertReadingAttempt(passage.id)
        await insertReadingAttempt(passage.id)
        const empty = await insertPassage(document.id)

        const rows = await passageRepository.findAdminList({ cursor: null, limit: 10, status: "draft" })

        expect(rows.map(({ attemptCount, passage: { id }, questionCount }) => ({ attemptCount, id, questionCount }))).toEqual([
          { attemptCount: 2, id: passage.id, questionCount: 3 },
          { attemptCount: 0, id: empty.id, questionCount: 0 },
        ])
      })
    })
  })

  describe("countByStatus", () => {
    describe("正常系", () => {
      it("絞り込みなしの全体の件数を、行の無い状態は 0 で埋めて返す", async () => {
        const source = await insertPassageSource()
        const document = await insertPassageDocument(source.id)
        await insertPassage(document.id)
        await insertPassage(document.id, { needsAttention: true })
        await insertPassage(document.id, { status: "published" })

        expect(await passageRepository.countByStatus()).toEqual({
          collected: 0,
          draft: 2,
          failed: 0,
          generating: 0,
          published: 1,
          rejected: 0,
        })
      })

      it("問題が 1 件も無ければすべて 0 を返す", async () => {
        expect(await passageRepository.countByStatus()).toEqual({
          collected: 0,
          draft: 0,
          failed: 0,
          generating: 0,
          published: 0,
          rejected: 0,
        })
      })
    })
  })

  describe("transitionStatus", () => {
    describe("正常系", () => {
      it("状態が from にあれば遷移し、渡した列だけを書く", async () => {
        const { passage } = await insertGeneratedPassage()
        const now = at("2026-10-13T09:00:00.000Z")

        expect(await passageRepository.transitionStatus(passage.id, { from: ["draft"], publishedAt: now, reviewedAt: now, to: "published" })).toBe(true)
        expect(await selectPassage(passage.id)).toMatchObject({ publishedAt: now, rejectReason: null, reviewedAt: now, status: "published" })

        expect(await passageRepository.transitionStatus(passage.id, { from: ["published"], to: "draft" })).toBe(true)
        expect(await selectPassage(passage.id)).toMatchObject({ publishedAt: now, reviewedAt: now, status: "draft" })
      })
    })

    describe("異常系", () => {
      it("状態が from に無ければ false を返し、何も変えない", async () => {
        const { passage } = await insertGeneratedPassage({ status: "published" })

        expect(await passageRepository.transitionStatus(passage.id, { from: ["draft"], rejectReason: "不向き", to: "rejected" })).toBe(false)
        expect(await selectPassage(passage.id)).toMatchObject({ rejectReason: null, status: "published" })
      })
    })
  })

  describe("updateDraftContent", () => {
    describe("正常系", () => {
      it("passages の列を書き、設問の並べ替え（Q1 と Q2 の入れ替え）が unique 違反にならない", async () => {
        const { glossary, passage, questions: questionRows } = await insertGeneratedPassage()
        const content = buildUnchangedContent(glossary, questionRows)
        const [first, second, third] = content.questions
        const blocks = PASSAGE_BLOCKS.map((block, index) => (index === 2 ? { ...block, translationJa: "直した和訳" } : block))

        const updated = await passageRepository.updateDraftContent(passage.id, {
          ...content,
          blocks,
          difficulty: 3,
          questions: [{ ...second, orderIndex: 0 }, { ...first, orderIndex: 1 }, third],
          timeLimitSeconds: 240,
          title: "Effects",
        })

        expect(updated).toBe(true)
        expect(await selectPassage(passage.id)).toMatchObject({ blocks, difficulty: 3, timeLimitSeconds: 240, title: "Effects" })
        expect((await selectQuestions(passage.id)).map(({ id, orderIndex }) => ({ id, orderIndex }))).toEqual([
          { id: questionRows[1].id, orderIndex: 0 },
          { id: questionRows[0].id, orderIndex: 1 },
          { id: questionRows[2].id, orderIndex: 2 },
        ])
      })

      it("リクエストに無い設問・用語集を消し、新規の設問を足す（既存の verification_choice_index は残す）", async () => {
        const { glossary, passage, questions: questionRows } = await insertGeneratedPassage()
        const content = buildUnchangedContent(glossary, questionRows)
        const [first, second] = content.questions

        const updated = await passageRepository.updateDraftContent(passage.id, {
          ...content,
          glossary: content.glossary.slice(0, 2),
          questions: [
            { ...first, prompt: "What is this passage about?" },
            { ...second, id: null, orderIndex: 1, prompt: "A new question" },
            { ...second, orderIndex: 2 },
          ],
        })

        expect(updated).toBe(true)
        const rows = await selectQuestions(passage.id)
        expect(rows).toHaveLength(3)
        expect(rows[0]).toMatchObject({ id: questionRows[0].id, orderIndex: 0, prompt: "What is this passage about?", verificationChoiceIndex: 1 })
        expect(rows[1]).toMatchObject({ orderIndex: 1, prompt: "A new question", verificationChoiceIndex: null })
        expect(rows[1].id).not.toBe(questionRows[1].id)
        expect(rows[2]).toMatchObject({ id: questionRows[1].id, orderIndex: 2 })
        expect(rows.map((row) => row.id)).not.toContain(questionRows[2].id)
        expect((await selectGlossary(passage.id)).map((entry) => entry.id)).toEqual([glossary[0].id, glossary[1].id])
      })

      it("新規の用語集を対象にした設問を紐づけ、既存の用語集の位置と意味を書き換える", async () => {
        const { glossary, passage, questions: questionRows } = await insertGeneratedPassage()
        const content = buildUnchangedContent(glossary, questionRows)
        const [first, second, third] = content.questions

        const updated = await passageRepository.updateDraftContent(passage.id, {
          ...content,
          glossary: [
            { ...content.glossary[0], meaningJa: "同期し続ける" },
            content.glossary[1],
            content.glossary[2],
            {
              id: null,
              blockIndex: 2,
              endOffset: 90,
              lemma: "event handler",
              meaningJa: "イベントハンドラ",
              noteJa: null,
              partOfSpeech: "名詞",
              startOffset: 77,
              surface: "event handler",
            },
          ],
          questions: [first, second, { ...third, targetGlossaryIndex: 3 }],
        })

        expect(updated).toBe(true)
        const savedGlossary = await selectGlossary(passage.id)
        const added = savedGlossary.find((entry) => entry.surface === "event handler")
        expect(added).toMatchObject({ blockIndex: 2, endOffset: 90, lemma: "event handler", startOffset: 77 })
        expect(savedGlossary.find((entry) => entry.id === glossary[0].id)).toMatchObject({ meaningJa: "同期し続ける" })
        expect((await selectQuestions(passage.id))[2]).toMatchObject({ id: questionRows[2].id, targetGlossaryEntryId: added?.id })
      })
    })

    describe("異常系", () => {
      it("draft でなければ false を返し、何も変えない", async () => {
        const { glossary, passage, questions: questionRows } = await insertGeneratedPassage({ status: "published" })
        const content = buildUnchangedContent(glossary, questionRows)

        const updated = await passageRepository.updateDraftContent(passage.id, { ...content, questions: [], title: "Changed" })

        expect(updated).toBe(false)
        expect(await selectPassage(passage.id)).toMatchObject({ status: "published", title: "Synchronizing with Effects" })
        expect(await selectQuestions(passage.id)).toHaveLength(3)
      })
    })
  })

  describe("resetForRegeneration", () => {
    describe("正常系", () => {
      it("設問・用語集を消し、和訳と生成の記録を空にして collected に戻す（英文とタイトルは残す）", async () => {
        const { passage } = await insertGeneratedPassage({
          attentionReasons: ["Q3：検証モデルは A を選択（正解は B）"],
          generationAttemptCount: 2,
          generationError: "timeout",
          generationStartedAt: at("2026-10-12T02:59:00.000Z"),
          needsAttention: true,
          rejectReason: "不向き",
          reviewedAt: at("2026-10-12T05:00:00.000Z"),
          status: "rejected",
        })

        expect(await passageRepository.resetForRegeneration(passage.id, ["draft", "rejected", "failed"])).toBe(true)
        expect(await selectPassage(passage.id)).toMatchObject({
          attentionReasons: [],
          blocks: PASSAGE_BLOCKS.map(({ translationJa: _translationJa, ...block }) => block),
          difficulty: null,
          generatedAt: null,
          generationAttemptCount: 0,
          generationError: null,
          generationModel: null,
          generationPromptVersion: null,
          generationStartedAt: null,
          needsAttention: false,
          rejectReason: null,
          reviewedAt: null,
          status: "collected",
          timeLimitSeconds: null,
          title: "Synchronizing with Effects",
        })
        expect((await selectPassage(passage.id)).blocks.every((block) => !("translationJa" in block))).toBe(true)
        expect(await selectQuestions(passage.id)).toEqual([])
        expect(await selectGlossary(passage.id)).toEqual([])
      })
    })

    describe("異常系", () => {
      it("状態が from に無ければ false を返し、何も消さない", async () => {
        const { passage } = await insertGeneratedPassage({ status: "published" })

        expect(await passageRepository.resetForRegeneration(passage.id, ["draft", "rejected", "failed"])).toBe(false)
        expect(await selectPassage(passage.id)).toMatchObject({ status: "published" })
        expect(await selectQuestions(passage.id)).toHaveLength(3)
      })

      it("挑戦が 1 件でもあれば false を返し、何も消さない", async () => {
        const source = await insertPassageSource()
        const document = await insertPassageDocument(source.id)
        const passage = await insertPassage(document.id)
        await insertPassageContent(passage.id)
        await insertReadingAttempt(passage.id)

        expect(await passageRepository.resetForRegeneration(passage.id, ["draft"])).toBe(false)
        expect(await selectPassage(passage.id)).toMatchObject({ status: "draft" })
        expect(await selectGlossary(passage.id)).toHaveLength(3)
      })
    })
  })
})
