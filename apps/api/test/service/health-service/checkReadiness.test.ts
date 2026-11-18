import { DatabaseHealthRepository, RedisHealthRepository } from "../../../src/repository"
import { checkReadiness } from "../../../src/service/health-service"

const mockDatabasePing = vi.fn<() => Promise<void>>()
const mockRedisPing = vi.fn<() => Promise<void>>()

const mockRepository: {
  databaseHealthRepository: DatabaseHealthRepository
  redisHealthRepository: RedisHealthRepository
} = {
  databaseHealthRepository: {
    ping: mockDatabasePing,
  },
  redisHealthRepository: {
    ping: mockRedisPing,
  },
}

describe("checkReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("全サービスが正常な場合、ok: true で全てokを返す", async () => {
    mockDatabasePing.mockResolvedValue(undefined)
    mockRedisPing.mockResolvedValue(undefined)

    const result = await checkReadiness(mockRepository)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.database.status).toBe("ok")
      expect(result.value.redis.status).toBe("ok")
      expect(result.value.database.latency_ms).toBeGreaterThanOrEqual(0)
      expect(result.value.redis.latency_ms).toBeGreaterThanOrEqual(0)
    }
    expect(mockDatabasePing).toHaveBeenCalledTimes(1)
    expect(mockRedisPing).toHaveBeenCalledTimes(1)
  })

  it("データベースがエラーの場合、ok: true のまま database のみ error を返す", async () => {
    mockDatabasePing.mockRejectedValue(new Error("DB connection failed"))
    mockRedisPing.mockResolvedValue(undefined)

    const result = await checkReadiness(mockRepository)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.database.status).toBe("error")
      expect(result.value.redis.status).toBe("ok")
    }
  })

  it("Redisがエラーの場合、ok: true のまま redis のみ error を返す", async () => {
    mockDatabasePing.mockResolvedValue(undefined)
    mockRedisPing.mockRejectedValue(new Error("Redis connection failed"))

    const result = await checkReadiness(mockRepository)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.database.status).toBe("ok")
      expect(result.value.redis.status).toBe("error")
    }
  })

  it("全サービスがエラーの場合、ok: true のまま全て error を返す", async () => {
    mockDatabasePing.mockRejectedValue(new Error("DB connection failed"))
    mockRedisPing.mockRejectedValue(new Error("Redis connection failed"))

    const result = await checkReadiness(mockRepository)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.database.status).toBe("error")
      expect(result.value.redis.status).toBe("error")
    }
  })
})
