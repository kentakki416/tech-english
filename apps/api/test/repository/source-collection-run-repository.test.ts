import { eq, sourceCollectionRuns } from "@repo/db"

import { DrizzleSourceCollectionRunRepository } from "../../src/repository/drizzle/source-collection-run-repository"
import { insertGitHubSource } from "../controller/admin/source/fixtures"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { insertSourceCollectionRun } from "../fixture/source-collection-run"

const sourceCollectionRunRepository = new DrizzleSourceCollectionRunRepository(testDb)

const NOW = new Date("2026-10-22T04:00:00.000Z")
const STALE_BEFORE = new Date("2026-10-22T03:30:00.000Z")

const selectRun = async (id: number) => {
  const [row] = await testDb.select().from(sourceCollectionRuns).where(eq(sourceCollectionRuns.id, id))
  return row
}

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DrizzleSourceCollectionRunRepository", () => {
  describe("create", () => {
    describe("正常系", () => {
      it("queued の記録を作って返す", async () => {
        const source = await insertGitHubSource()

        const result = await sourceCollectionRunRepository.create(source.id)

        expect(result).toEqual({
          kind: "created",
          run: {
            id: expect.any(Number),
            createdPassageCount: null,
            error: null,
            fetchedDocumentCount: null,
            finishedAt: null,
            sourceId: source.id,
            startedAt: null,
            status: "queued",
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          },
        })
      })

      it("終わった記録しか無ければ作れ、別のソースが収集中でも作れる", async () => {
        const source = await insertGitHubSource()
        const otherSource = await insertGitHubSource({ repository: "example/other" })
        await insertSourceCollectionRun({ sourceId: source.id, status: "completed" })
        await insertSourceCollectionRun({ sourceId: otherSource.id, status: "running" })

        const result = await sourceCollectionRunRepository.create(source.id)

        expect(result.kind).toBe("created")
      })
    })

    describe("異常系", () => {
      it.each(["queued", "running"] as const)("そのソースに %s の記録があれば active_exists を返し、行を足さない", async (status) => {
        const source = await insertGitHubSource()
        await insertSourceCollectionRun({ sourceId: source.id, status })

        const result = await sourceCollectionRunRepository.create(source.id)

        expect(result).toEqual({ kind: "active_exists" })
        expect(await testDb.select().from(sourceCollectionRuns)).toHaveLength(1)
      })
    })
  })

  describe("failTimedOut", () => {
    describe("正常系", () => {
      it("queued は依頼した時刻、running は始めた時刻が staleBefore より前なら failed にし、境界ちょうどは残す", async () => {
        const source = await insertGitHubSource()
        const oldQueued = await insertSourceCollectionRun({ createdAt: new Date(STALE_BEFORE.getTime() - 1), sourceId: source.id, status: "queued" })

        const count = await sourceCollectionRunRepository.failTimedOut({
          error: "30 分を過ぎても終わらなかった",
          now: NOW,
          sourceId: source.id,
          staleBefore: STALE_BEFORE,
        })

        expect(count).toBe(1)
        expect(await selectRun(oldQueued.id)).toMatchObject({
          error: "30 分を過ぎても終わらなかった",
          finishedAt: NOW,
          status: "failed",
        })
      })

      it.each([
        ["queued で依頼した時刻がちょうど staleBefore", { createdAt: STALE_BEFORE, status: "queued" }],
        ["running で始めた時刻がちょうど staleBefore", { createdAt: new Date("2026-10-22T03:00:00.000Z"), startedAt: STALE_BEFORE, status: "running" }],
        ["completed（どれだけ古くても）", { createdAt: new Date("2026-10-01T00:00:00.000Z"), status: "completed" }],
      ] as const)("%s なら変えない", async (_label, values) => {
        const source = await insertGitHubSource()
        const run = await insertSourceCollectionRun({ ...values, sourceId: source.id })

        const count = await sourceCollectionRunRepository.failTimedOut({
          error: "30 分を過ぎても終わらなかった",
          now: NOW,
          sourceId: source.id,
          staleBefore: STALE_BEFORE,
        })

        expect(count).toBe(0)
        expect(await selectRun(run.id)).toMatchObject({ error: null, status: values.status })
      })

      it("running は依頼した時刻が古くても、始めた時刻が新しければ変えない。始めた時刻が 1ms 前なら failed にする", async () => {
        const source = await insertGitHubSource()
        const run = await insertSourceCollectionRun({
          createdAt: new Date("2026-10-22T03:00:00.000Z"),
          sourceId: source.id,
          startedAt: new Date(STALE_BEFORE.getTime() + 1),
          status: "running",
        })
        const input = { error: "30 分を過ぎても終わらなかった", now: NOW, sourceId: source.id, staleBefore: STALE_BEFORE }

        expect(await sourceCollectionRunRepository.failTimedOut(input)).toBe(0)

        await testDb.update(sourceCollectionRuns)
          .set({ startedAt: new Date(STALE_BEFORE.getTime() - 1) })
          .where(eq(sourceCollectionRuns.id, run.id))
        expect(await sourceCollectionRunRepository.failTimedOut(input)).toBe(1)
        expect(await selectRun(run.id)).toMatchObject({ status: "failed" })
      })

      it("別のソースの記録は変えない", async () => {
        const source = await insertGitHubSource()
        const otherSource = await insertGitHubSource({ repository: "example/other" })
        const otherRun = await insertSourceCollectionRun({ createdAt: new Date("2026-10-22T03:00:00.000Z"), sourceId: otherSource.id, status: "queued" })

        await sourceCollectionRunRepository.failTimedOut({
          error: "30 分を過ぎても終わらなかった",
          now: NOW,
          sourceId: source.id,
          staleBefore: STALE_BEFORE,
        })

        expect(await selectRun(otherRun.id)).toMatchObject({ status: "queued" })
      })
    })
  })

  describe("findLatestBySourceId", () => {
    describe("正常系", () => {
      it("そのソースの id が一番大きい記録を返す", async () => {
        const source = await insertGitHubSource()
        const otherSource = await insertGitHubSource({ repository: "example/other" })
        await insertSourceCollectionRun({ sourceId: source.id, status: "completed" })
        const latest = await insertSourceCollectionRun({ sourceId: source.id, status: "failed" })
        await insertSourceCollectionRun({ sourceId: otherSource.id, status: "queued" })

        expect(await sourceCollectionRunRepository.findLatestBySourceId(source.id)).toMatchObject({ id: latest.id, status: "failed" })
      })

      it("記録が無ければ null", async () => {
        const source = await insertGitHubSource()

        expect(await sourceCollectionRunRepository.findLatestBySourceId(source.id)).toBeNull()
      })
    })
  })

  describe("markQueuedAsFailed", () => {
    describe("正常系", () => {
      it("queued の記録を failed にする", async () => {
        const source = await insertGitHubSource()
        const run = await insertSourceCollectionRun({ sourceId: source.id, status: "queued" })

        await sourceCollectionRunRepository.markQueuedAsFailed({ error: "Queue に積めなかった", id: run.id })

        expect(await selectRun(run.id)).toMatchObject({ error: "Queue に積めなかった", finishedAt: expect.any(Date), status: "failed" })
      })
    })

    describe("異常系", () => {
      it("queued でなければ変えない（worker が先に running にした）", async () => {
        const source = await insertGitHubSource()
        const run = await insertSourceCollectionRun({ sourceId: source.id, startedAt: NOW, status: "running" })

        await sourceCollectionRunRepository.markQueuedAsFailed({ error: "Queue に積めなかった", id: run.id })

        expect(await selectRun(run.id)).toMatchObject({ error: null, status: "running" })
      })
    })
  })
})
