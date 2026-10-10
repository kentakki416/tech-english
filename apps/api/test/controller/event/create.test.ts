import request from "supertest"

import { FakeEventTracker } from "@repo/events"

import { EventCreateController } from "../../../src/controller/event/create"
import { eventRouter } from "../../../src/routes/event-router"
import { attachUnhandledExceptionHandler, createTestApp, createTestUser } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis } from "../setup"

const eventTracker = new FakeEventTracker()

const app = createTestApp()
app.use("/api/events", eventRouter({ create: new EventCreateController(eventTracker) }))
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

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  name: "memo_viewed",
  occurredAt: "2026-01-01T00:00:00.000Z",
  properties: { memo_id: 1 },
  ...overrides,
})

describe("POST /api/events", () => {
  describe("正常系", () => {
    it("イベントを受理して accepted に件数を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: [buildEvent(), buildEvent({ name: "memo_created" })] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ accepted: 2 })
    })

    it("受け取った配列を 1 回の trackAll でまとめて渡す", async () => {
      const { token, user } = await createTestUser()

      await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: [buildEvent(), buildEvent(), buildEvent()] })

      expect(eventTracker.inputs).toHaveLength(3)
      expect(eventTracker.inputs.every((i) => i.userId === user.id)).toBe(true)
    })

    /**
     * クライアントが他人の ID を詐称できないことの確認。
     * userId は必ず認証済みユーザーから server 側で解決する。
     */
    it("ボディに userId を混ぜても無視し、認証済みユーザーの ID を使う", async () => {
      const { token, user } = await createTestUser()

      await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: [buildEvent({ userId: 99999 })] })

      expect(eventTracker.inputs[0]?.userId).toBe(user.id)
    })
  })

  describe("異常系", () => {
    it("認証なしの場合 401 を返す", async () => {
      const res = await request(app).post("/api/events").send({ events: [buildEvent()] })

      expect(res.status).toBe(401)
      expect(eventTracker.inputs).toHaveLength(0)
    })

    it("イベントが 0 件の場合 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: [] })

      expect(res.status).toBe(400)
      expect(eventTracker.inputs).toHaveLength(0)
    })

    it("イベントが 50 件を超える場合 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: Array.from({ length: 51 }, () => buildEvent()) })

      expect(res.status).toBe(400)
      expect(eventTracker.inputs).toHaveLength(0)
    })

    it("定義されていないイベント名の場合 400 を返す", async () => {
      const { token } = await createTestUser()

      const res = await request(app)
        .post("/api/events")
        .set("Authorization", `Bearer ${token}`)
        .send({ events: [buildEvent({ name: "unknown_event" })] })

      expect(res.status).toBe(400)
      expect(eventTracker.inputs).toHaveLength(0)
    })
  })
})
