import { eq, sourceCollectionRuns, sources, sql } from "@repo/db"

import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"

/**
 * source_collection_runs の制約を実 DB で確かめる（docs/spec/manual-collection/tasks/step1-db-source-collection-runs.md）。
 * 定数に無い値は Drizzle の型で弾かれるので、sql の生 insert で入れる
 */

type SourceCollectionRunStatusValue = typeof sourceCollectionRuns.$inferInsert["status"]

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

const insertGitHubSource = async (repository: string) => {
  const [row] = await testDb
    .insert(sources)
    .values({
      branch: "main",
      fetchType: "github_repository",
      includeGlobs: ["docs/**/*.md"],
      kind: "docs",
      licenseSpdx: "MIT",
      licenseUrl: `https://github.com/${repository}/blob/main/LICENSE`,
      name: repository,
      repository,
    })
    .returning()
  return row
}

const RUN_TIME = new Date("2026-10-22T03:00:00.000Z")

/**
 * 状態に合わせて、CHECK が求める時刻（running の started_at・終わった記録の finished_at）を入れる
 */
const insertRun = async (sourceId: number, status: SourceCollectionRunStatusValue) => {
  const [row] = await testDb
    .insert(sourceCollectionRuns)
    .values({
      finishedAt: status === "queued" || status === "running" ? null : RUN_TIME,
      sourceId,
      startedAt: status === "queued" ? null : RUN_TIME,
      status,
    })
    .returning()
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

describe("source_collection_runs", () => {
  describe("正常系", () => {
    it("queued で insert でき、件数・理由・時刻は null", async () => {
      const source = await insertGitHubSource("example/docs")

      const run = await insertRun(source.id, "queued")

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
        const source = await insertGitHubSource("example/docs")
        await insertRun(source.id, status)
        await insertRun(source.id, status)

        await expect(insertRun(source.id, "queued")).resolves.toMatchObject({ status: "queued" })
      },
    )

    it("別のソースなら queued が並んでも入る", async () => {
      const source = await insertGitHubSource("example/docs")
      const otherSource = await insertGitHubSource("example/other")
      await insertRun(source.id, "queued")

      await expect(insertRun(otherSource.id, "queued")).resolves.toMatchObject({ sourceId: otherSource.id })
    })

    it("ソースを消すと記録も消える", async () => {
      const source = await insertGitHubSource("example/docs")
      await insertRun(source.id, "completed")

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
      const source = await insertGitHubSource("example/docs")
      await insertRun(source.id, existingStatus)

      await expect(insertRun(source.id, status)).rejects.toMatchObject(
        buildViolationMatcher(UNIQUE_VIOLATION, "source_collection_runs_source_id_active_key"),
      )
    })

    it("running で started_at が無ければ失敗する", async () => {
      const source = await insertGitHubSource("example/docs")

      await expect(testDb.insert(sourceCollectionRuns).values({ sourceId: source.id, status: "running" })).rejects.toMatchObject(
        buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_running_columns_check"),
      )
    })

    it.each(["completed", "failed", "limit_reached", "rate_limited", "up_to_date"] as const)(
      "%s で finished_at が無ければ失敗する",
      async (status) => {
        const source = await insertGitHubSource("example/docs")

        await expect(testDb.insert(sourceCollectionRuns).values({ sourceId: source.id, status })).rejects.toMatchObject(
          buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_finished_columns_check"),
        )
      },
    )

    it("status が値の集合の外なら失敗する", async () => {
      const source = await insertGitHubSource("example/docs")

      await expect(
        testDb.execute(sql`
          INSERT INTO source_collection_runs (source_id, status, finished_at, updated_at)
          VALUES (${source.id}, 'cancelled', now(), now())
        `),
      ).rejects.toMatchObject(buildViolationMatcher(CHECK_VIOLATION, "source_collection_runs_status_check"))
    })
  })
})
