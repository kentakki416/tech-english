import { IoRedisRefreshTokenRepository } from "../../src/repository/redis"
import { cleanupTestRedis, disconnectTestDb, disconnectTestRedis, testRedis } from "../controller/setup"

/**
 * Redis 実装の RefreshTokenRepository を実 Redis（テスト用 DB 1）で確かめる。キー名・TTL・値の変換は mock では検出できないため
 */
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)
const adminRefreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis, "admin_refresh_token")

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

  describe("キーの接頭辞", () => {
    describe("正常系", () => {
      it("接頭辞 admin_refresh_token で作ると、キーが admin_refresh_token:{jti} と admin_refresh_token_rotated:{jti} になる", async () => {
        await adminRefreshTokenRepository.save("jti-1", 7, 60)
        await adminRefreshTokenRepository.saveRotatedTokens("jti-1", ROTATED_TOKENS, 30)

        expect(await testRedis.get("admin_refresh_token:jti-1")).toBe("7")
        expect(JSON.parse((await testRedis.get("admin_refresh_token_rotated:jti-1"))!)).toEqual(ROTATED_TOKENS)
        expect((await testRedis.keys("*")).sort()).toEqual(["admin_refresh_token:jti-1", "admin_refresh_token_rotated:jti-1"])
      })
    })

    describe("異常系", () => {
      it("同じ jti で既定の接頭辞と admin の接頭辞の両方に保存しても、互いに読めず、消しても相手は残る", async () => {
        await refreshTokenRepository.save("same-jti", 1, 60)
        await refreshTokenRepository.saveRotatedTokens("same-jti", ROTATED_TOKENS, 30)
        const adminRotated = { accessToken: "admin.access", refreshToken: "admin.refresh" }
        await adminRefreshTokenRepository.save("same-jti", 7, 60)
        await adminRefreshTokenRepository.saveRotatedTokens("same-jti", adminRotated, 30)

        expect(await refreshTokenRepository.findUserId("same-jti")).toBe(1)
        expect(await adminRefreshTokenRepository.findUserId("same-jti")).toBe(7)
        expect(await refreshTokenRepository.findRotatedTokens("same-jti")).toEqual(ROTATED_TOKENS)
        expect(await adminRefreshTokenRepository.findRotatedTokens("same-jti")).toEqual(adminRotated)

        await adminRefreshTokenRepository.delete("same-jti")

        expect(await adminRefreshTokenRepository.findUserId("same-jti")).toBeNull()
        expect(await refreshTokenRepository.findUserId("same-jti")).toBe(1)
      })

      it("admin の接頭辞のリポジトリは、既定の接頭辞だけに保存した jti を読めない", async () => {
        await refreshTokenRepository.save("user-jti", 1, 60)
        await refreshTokenRepository.saveRotatedTokens("user-jti", ROTATED_TOKENS, 30)

        expect(await adminRefreshTokenRepository.findUserId("user-jti")).toBeNull()
        expect(await adminRefreshTokenRepository.findRotatedTokens("user-jti")).toBeNull()
      })
    })
  })
})
