import { IoRedisRefreshTokenRepository } from "../../src/repository/redis"
import { cleanupTestRedis, disconnectTestDb, disconnectTestRedis, testRedis } from "../controller/setup"

/**
 * Redis 実装の RefreshTokenRepository を実 Redis（テスト用 DB 1）で確かめる。キー名・TTL・値の変換は mock では検出できないため
 */
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const ROTATED_TOKENS = { accessToken: "new.access", refreshToken: "new.refresh" }

beforeEach(async () => {
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("IoRedisRefreshTokenRepository", () => {
  describe("save / findUserId / delete", () => {
    describe("正常系", () => {
      it("保存した jti の userId を返し、TTL を付けて保存する", async () => {
        await refreshTokenRepository.save("jti-1", 42, 60)

        expect(await refreshTokenRepository.findUserId("jti-1")).toBe(42)
        const ttl = await testRedis.ttl("refresh_token:jti-1")
        expect(ttl).toBeGreaterThan(0)
        expect(ttl).toBeLessThanOrEqual(60)
      })

      it("delete した jti は null になり、他の jti は残る", async () => {
        await refreshTokenRepository.save("jti-1", 42, 60)
        await refreshTokenRepository.save("jti-2", 42, 60)

        await refreshTokenRepository.delete("jti-1")

        expect(await refreshTokenRepository.findUserId("jti-1")).toBeNull()
        expect(await refreshTokenRepository.findUserId("jti-2")).toBe(42)
      })
    })

    describe("異常系", () => {
      it("保存していない jti は null", async () => {
        expect(await refreshTokenRepository.findUserId("missing")).toBeNull()
      })
    })
  })

  describe("saveRotatedTokens / findRotatedTokens", () => {
    describe("正常系", () => {
      it("旧 jti に対して保存したペアをそのまま返し、TTL を付けて保存する", async () => {
        await refreshTokenRepository.saveRotatedTokens("old-jti", ROTATED_TOKENS, 30)

        expect(await refreshTokenRepository.findRotatedTokens("old-jti")).toEqual(ROTATED_TOKENS)
        const ttl = await testRedis.ttl("refresh_token_rotated:old-jti")
        expect(ttl).toBeGreaterThan(0)
        expect(ttl).toBeLessThanOrEqual(30)
      })

      it("猶予の記録は refresh token の jti とは別のキーで、findUserId や delete に影響しない", async () => {
        await refreshTokenRepository.save("old-jti", 42, 60)
        await refreshTokenRepository.saveRotatedTokens("old-jti", ROTATED_TOKENS, 30)

        await refreshTokenRepository.delete("old-jti")

        expect(await refreshTokenRepository.findUserId("old-jti")).toBeNull()
        expect(await refreshTokenRepository.findRotatedTokens("old-jti")).toEqual(ROTATED_TOKENS)
        expect(await testRedis.keys("refresh_token:*")).toEqual([])
      })
    })

    describe("異常系", () => {
      it("保存していない（猶予を過ぎて消えた）jti は null", async () => {
        expect(await refreshTokenRepository.findRotatedTokens("missing")).toBeNull()
      })

      it("TTL が切れると null になる", async () => {
        await refreshTokenRepository.saveRotatedTokens("old-jti", ROTATED_TOKENS, 1)
        await testRedis.pexpire("refresh_token_rotated:old-jti", 1)
        await new Promise(resolve => setTimeout(resolve, 20))

        expect(await refreshTokenRepository.findRotatedTokens("old-jti")).toBeNull()
      })
    })
  })
})
