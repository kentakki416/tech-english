import { createDrizzleClient, DrizzleClient, sourceCollectionRuns } from "@repo/db"

import type { SourceCollectionRunClaim } from "../../../src/repository"
import { DrizzleSourceCollectionRunRepository } from "../../../src/repository/drizzle"

const NOW = new Date("2026-10-22T04:00:00.000Z")

const CLAIM: SourceCollectionRunClaim = { runId: 10, sourceId: 3, startedAt: new Date("2026-10-22T03:59:00.123Z") }

/**
 * 記録した条件を SQL の文字列にする。接続しない（Pool は最初のクエリまで接続しない）実物の client の toSQL を使う
 */
const renderClient = createDrizzleClient({ url: "postgresql://user:password@127.0.0.1:1/unused" })

/**
 * バインド変数の番号（$1, $2, ...）は値の数で変わるので $? にそろえる
 */
const normalizeParams = (text: string): string => text.replace(/\$\d+/g, "$?")

/**
 * `db.update(table).set(values).where(condition).returning(selection)` を記録する偽物
 */
const createFakeUpdateDb = (rows: unknown[]) => {
  const returning = vi.fn(async (_selection: unknown) => rows)
  const where = vi.fn((_condition: unknown) => ({ returning }))
  const set = vi.fn((_values: unknown) => ({ where }))
  const update = vi.fn((_table: unknown) => ({ set }))
  return { db: { update } as unknown as DrizzleClient, returning, set, update, where }
}

/**
 * 記録した set / where を UPDATE 文にする（updated_at は Drizzle が足す）
 */
const renderUpdate = (fake: ReturnType<typeof createFakeUpdateDb>) => {
  const [values] = fake.set.mock.calls[0] as [never]
  const [condition] = fake.where.mock.calls[0] as [never]
  const query = renderClient.update(sourceCollectionRuns).set(values).where(condition).toSQL()
  return { params: query.params, sql: normalizeParams(query.sql) }
}

describe("DrizzleSourceCollectionRunRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await renderClient.$disconnect()
  })

  describe("claim", () => {
    describe("正常系", () => {
      it("queued か running の記録を running にして started_at を入れ、トークンを返す", async () => {
        const fake = createFakeUpdateDb([{ sourceId: 3, startedAt: NOW }])

        const claim = await new DrizzleSourceCollectionRunRepository(fake.db).claim(10, NOW)

        expect(claim).toEqual({ runId: 10, sourceId: 3, startedAt: NOW })
        expect(fake.set).toHaveBeenCalledWith({ startedAt: NOW, status: "running" })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain("where ((\"source_collection_runs\".\"id\" = $?) and (\"source_collection_runs\".\"status\" in ($?, $?)))")
        expect(params.slice(-3)).toEqual([10, "queued", "running"])
      })
    })

    describe("異常系", () => {
      it("当たる行が無ければ（時間切れで片付けられた・終わった）null", async () => {
        const fake = createFakeUpdateDb([])

        expect(await new DrizzleSourceCollectionRunRepository(fake.db).claim(10, NOW)).toBeNull()
      })
    })
  })

  describe("finish", () => {
    describe("正常系", () => {
      it("最後まで動いた結果は件数・状態・終わった時刻を、トークン（running と started_at）が同じ行にだけ書く", async () => {
        const fake = createFakeUpdateDb([{ id: 10 }])

        const isWritten = await new DrizzleSourceCollectionRunRepository(fake.db).finish(
          CLAIM,
          { createdPassageCount: 12, fetchedDocumentCount: 5, status: "completed" },
          NOW,
        )

        expect(isWritten).toBe(true)
        expect(fake.set).toHaveBeenCalledWith({
          createdPassageCount: 12,
          fetchedDocumentCount: 5,
          finishedAt: NOW,
          status: "completed",
        })
        const { params, sql } = renderUpdate(fake)
        expect(sql).toContain([
          "where ((\"source_collection_runs\".\"id\" = $?) and (\"source_collection_runs\".\"status\" = $?)",
          " and (\"source_collection_runs\".\"started_at\" = $?))",
        ].join(""))
        expect(params.slice(-3)).toEqual([10, "running", "2026-10-22T03:59:00.123Z"])
      })

      it("失敗は理由・状態・終わった時刻を書く（件数は書かない）", async () => {
        const fake = createFakeUpdateDb([{ id: 10 }])

        await new DrizzleSourceCollectionRunRepository(fake.db).finish(CLAIM, { error: "ソースが無かった", status: "failed" }, NOW)

        expect(fake.set).toHaveBeenCalledWith({ error: "ソースが無かった", finishedAt: NOW, status: "failed" })
      })
    })

    describe("異常系", () => {
      it("トークンが古く当たる行が無ければ false", async () => {
        const fake = createFakeUpdateDb([])

        const isWritten = await new DrizzleSourceCollectionRunRepository(fake.db).finish(
          CLAIM,
          { createdPassageCount: 0, fetchedDocumentCount: 0, status: "up_to_date" },
          NOW,
        )

        expect(isWritten).toBe(false)
      })
    })
  })
})
