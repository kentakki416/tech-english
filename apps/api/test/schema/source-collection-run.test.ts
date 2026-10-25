import { eq, sourceCollectionRuns, sources, sql } from "@repo/db"

import { insertGitHubSource } from "../controller/admin/source/fixtures"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { insertSourceCollectionRun } from "../fixture/source-collection-run"

/**
 * source_collection_runs の制約を実 DB で確かめる（docs/spec/manual-collection/tasks/step1-db-source-collection-runs.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert で入れる
 */

/**
 * Postgres のエラーコード（SQLSTATE）
 */
const CHECK_VIOLATION = "23514"
const UNIQUE_VIOLATION = "23505"

/**
 * 指定した制約で失敗したことを表す matcher。Drizzle は pg のエラーを DrizzleQueryError の cause に入れる
 */
const buildViolationMatcher = (code: string, constraint: string) => ({
  cause: expect.objectContaining({ code, constraint }),
})

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("source_collection_runs", () => {
  describe("正常系", () => {
    it("queued で insert でき、件数・理由・時刻は null", async () => {
      const source = await insertGitHubSource()

      const run = await insertSourceCollectionRun({ sourceId: source.id, status: "queued" })

      expect(run).toMatchObject({
        createdPassageCount: null,
        error: null,
        fetchedDocumentCount: null,
        finishedAt: null,
        sourceId: source.id,
        startedAt: null,
        status: "queued",
      })
    })

    it.each(["completed", "failed", "limit_reached", "rate_limited", "up_to_date"] as const)(
      "終わった記録（%s）が同じソースにいくつあっても、queued を足せる",
      async (status) => {
        const source = await insertGitHubSource()
        await insertSourceCollectionRun({ sourceId: source.id, status: status })
        await insertSourceCollectionRun({ sourceId: source.id, status: status })

        await expect(insertSourceCollectionRun({ sourceId: source.id, status: "queued" })).resolves.toMatchObject({ status: "queued" })
      },
    )

    it("別のソースなら queued が並んでも入る", async () => {
      const source = await insertGitHubSource()
      const otherSource = await insertGitHubSource({ repository: "example/other" })
      await insertSourceCollectionRun({ sourceId: source.id, status: "queued" })

      await expect(insertSourceCollectionRun({ sourceId: otherSource.id, status: "queued" })).resolves.toMatchObject({ sourceId: otherSource.id })
    })

    it("ソースを消すと記録も消える", async () => {
      const source = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: source.id, status: "completed" })

      await testDb.delete(sources).where(eq(sources.id, source.id))

      expect(await testDb.select().from(sourceCollectionRuns)).toEqual([])
    })
  })

  describe("異常系", () => {
    it.each([
      ["queued", "queued"],
      ["queued", "running"],
      ["running", "queued"],
    ] as const)("同じソースに %s があると %s を足せない", async (existingStatus, status) => {
      const source = await insertGitHubSource()
      await insertSourceCollectionRun({ sourceId: source.id, status: existingStatus })

      await expect(insertSourceCollectionRun({ sourceId: source.id, status: status })).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "source_collection_runs_source_id_active_key"),
      )
    })

    it("running で started_at が無ければ失敗する", async () => {
      const source = await insertGitHubSource()

      await expect(testDb.insert(sourceCollectionRuns).values({ sourceId: source.id, status: "running" })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_running_columns_check"),
      )
    })

    it.each(["completed", "failed", "limit_reached", "rate_limited", "up_to_date"] as const)(
      "%s で finished_at が無ければ失敗する",
      async (status) => {
        const source = await insertGitHubSource()

        await expect(testDb.insert(sourceCollectionRuns).values({ sourceId: source.id, status })).rejects.toMatchObject(
          buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_finished_columns_check"),
        )
      },
    )

    it("status が値の集合の外なら失敗する", async () => {
      const source = await insertGitHubSource()

      await expect(
        testDb.execute(sql`
          INSERT INTO source_collection_runs (source_id, status, finished_at, updated_at)
          VALUES (${source.id}, 'cancelled', now(), now())
        `),
      ).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_status_check"))
    })
  })
})
