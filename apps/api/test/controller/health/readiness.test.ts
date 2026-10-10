import request from "supertest"

import { HealthReadinessController } from "../../../src/controller/health/readiness"
import { DrizzleDatabaseHealthRepository } from "../../../src/repository/drizzle/healthcheck-repository"
import { IoRedisHealthRepository } from "../../../src/repository/redis/healthcheck-repository"
import { healthRouter } from "../../../src/routes/health-router"
import { attachUnhandledExceptionHandler, createTestApp } from "../helper"
import { disconnectTestDb, disconnectTestRedis, testDb, testRedis } from "../setup"

const databaseHealthRepository = new DrizzleDatabaseHealthRepository(testDb)
const redisHealthRepository = new IoRedisHealthRepository(testRedis)

const app = createTestApp()

const readinessController = new HealthReadinessController(
  databaseHealthRepository,
  redisHealthRepository,
)

app.use("/api/health", healthRouter({ readiness: readinessController }))
attachUnhandledExceptionHandler(app)

afterAll(async () => {
  await disconnectTestRedis()
  await disconnectTestDb()
})

describe("GET /api/health/ready", () => {
  it("全サービス正常時、200 と status: ok を返す", async () => {
    const res = await request(app).get("/api/health/ready")

    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(res.body.services.database.status).toBe("ok")
    expect(res.body.services.redis.status).toBe("ok")
  })
})
