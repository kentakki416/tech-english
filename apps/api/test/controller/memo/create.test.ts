import request from "supertest"

import { eq, memos } from "@repo/db"
import { FakeEventTracker } from "@repo/events"

import { MemoCreateController } from "../../../src/controller/memo/create"
import { DrizzleMemoRepository } from "../../../src/repository/drizzle/memo-repository"
import { memoRouter } from "../../../src/routes/memo-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../setup"

const memoRepository = new DrizzleMemoRepository(testDb)

const app = createTestApp()

app.use("/api/memo", memoRouter({ create: new MemoCreateController(memoRepository, new FakeEventTracker()) }))
attachUnhandledExceptionHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/memo", () => {
  it("201 と作成されたメモを返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({ body: "New Body", title: "New Title" })

    expect(res.status).toBe(201)
    expect(res.body.title).toBe("New Title")
    expect(res.body.body).toBe("New Body")
    expect(res.body.id).toBeDefined()

    // DBに実際に保存されていることを確認
    const [memo] = await testDb.select().from(memos).where(eq(memos.id, res.body.id))
    expect(memo).toBeDefined()
    expect(memo.title).toBe("New Title")
  })

  it("リクエストボディが不正な場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it("titleが空の場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({ body: "Body", title: "" })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})
