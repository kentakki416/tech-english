import request from "supertest"

import { eq, memos } from "@repo/db"
import { FakeEventTracker } from "@repo/events"

import { MemoDeleteController } from "../../../src/controller/memo/delete"
import { MemoDetailController } from "../../../src/controller/memo/detail"
import { DrizzleMemoRepository } from "../../../src/repository/drizzle/memo-repository"
import { memoRouter } from "../../../src/routes/memo-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const eventTracker = new FakeEventTracker()

const memoRepository = new DrizzleMemoRepository(testDb)

const app = createTestApp()

app.use("/api/memo", memoRouter({
  delete: new MemoDeleteController(memoRepository, eventTracker),
  detail: new MemoDetailController(memoRepository),
}))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  eventTracker.inputs.length = 0
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DELETE /api/memo/:id", () => {
  it("200 と削除成功メッセージを返す", async () => {
    const [memo] = await testDb
      .insert(memos)
      .values({ body: "Test Body", title: "Test Title" })
      .returning()

    const res = await request(app).delete(`/api/memo/${memo.id}`)

    expect(res.status).toBe(200)
    expect(res.body.message).toBeDefined()

    // DBから実際に削除されていることを確認
    const [deleted] = await testDb.select().from(memos).where(eq(memos.id, memo.id))
    expect(deleted).toBeUndefined()
  })

  it("メモが存在しない場合、404 を返す", async () => {
    const res = await request(app).delete("/api/memo/999999")

    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it("無効なID形式の場合、400 を返す", async () => {
    const res = await request(app).delete("/api/memo/abc")

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

describe("公開パスでの optional 認証と行動イベント", () => {
  describe("正常系", () => {
    /**
     * /api/memo は PUBLIC_PATHS に含まれるが、トークンが付いていれば
     * userId を解決して行動イベントを記録する（optional 認証）。
     */
    it("トークン付きで削除すると memo_deleted を userId 付きで記録する", async () => {
      const { token, user } = await createTestUser()
      const [memo] = await testDb.insert(memos).values({ body: "b", title: "t" }).returning()

      const res = await request(app)
        .delete(`/api/memo/${memo.id}`)
        .set("Authorization", `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(eventTracker.inputs).toEqual([
        { name: "memo_deleted", properties: { memo_id: memo.id }, source: "api", userId: user.id },
      ])
    })

    /** 未認証アクセスは従来どおり通る（401 にしない）が、イベントは記録しない */
    it("トークンなしでも削除は成功し、イベントは記録されない", async () => {
      const [memo] = await testDb.insert(memos).values({ body: "b", title: "t" }).returning()

      const res = await request(app).delete(`/api/memo/${memo.id}`)

      expect(res.status).toBe(200)
      expect(eventTracker.inputs).toHaveLength(0)
    })

    /** 不正なトークンでも 401 にせず未ログイン扱いにする */
    it("不正なトークンでも削除は成功し、イベントは記録されない", async () => {
      const [memo] = await testDb.insert(memos).values({ body: "b", title: "t" }).returning()

      const res = await request(app)
        .delete(`/api/memo/${memo.id}`)
        .set("Authorization", "Bearer invalid-token")

      expect(res.status).toBe(200)
      expect(eventTracker.inputs).toHaveLength(0)
    })
  })
})
