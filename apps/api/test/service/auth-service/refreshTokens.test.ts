import { User } from "@repo/domain"

import { RefreshTokenRepository, RotatedTokens, UserRepository } from "../../../src/repository"
import { refreshTokens } from "../../../src/service/auth-service"

const mockDelete = vi.fn<(_0: string) => Promise<void>>()
const mockFindRotatedTokens = vi.fn<(_0: string) => Promise<RotatedTokens | null>>()
const mockFindUserId = vi.fn<(_0: string) => Promise<number | null>>()
const mockSave = vi.fn<(_0: string, _1: number, _2: number) => Promise<void>>()
const mockSaveRotatedTokens = vi.fn<(_0: string, _1: RotatedTokens, _2: number) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: mockDelete,
  findRotatedTokens: mockFindRotatedTokens,
  findUserId: mockFindUserId,
  save: mockSave,
  saveRotatedTokens: mockSaveRotatedTokens,
}

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUserRepository: UserRepository = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findByEmail: vi.fn(),
  findById: mockFindById,
  findForAdmin: vi.fn(),
  updateProfile: vi.fn(),
  updateTimezone: vi.fn(),
}

const repo = { refreshTokenRepository: mockRefreshTokenRepository, tokenOwnerRepository: mockUserRepository }

const mockGenerators = {
  generateAccessToken: vi.fn((_userId: number) => "new.access"),
  generateRefreshToken: vi.fn((_userId: number) => ({ jti: "new-jti", token: "new.refresh" })),
}

/**
 * 旧 refresh token（valid.token → old-jti）と、ローテーションで発行した refresh token（new.refresh → new-jti）を検証する
 */
const verifyRefreshTokenStub = (token: string): { jti: string; userId: number } | null => {
  if (token === "valid.token") return { jti: "old-jti", userId: 1 }
  if (token === "new.refresh") return { jti: "new-jti", userId: 1 }
  return null
}

/**
 * Redis に残っている jti → userId。載っていない jti は null（失効済み）
 */
const stubFindUserId = (userIdByJti: Record<string, number>): void => {
  mockFindUserId.mockImplementation(async (jti) => userIdByJti[jti] ?? null)
}

const ROTATED_TOKENS: RotatedTokens = { accessToken: "new.access", refreshToken: "new.refresh" }

const buildUser = (overrides?: Partial<User>): User => ({
  id: 1,
  avatarUrl: null,
  email: "test@example.com",
  name: "Test User",
  timezone: "Asia/Tokyo",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe("refreshTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindRotatedTokens.mockResolvedValue(null)
  })

  describe("正常系", () => {
    it("旧 jti を破棄し、新しい Access/Refresh Token を発行する", async () => {
      mockFindUserId.mockResolvedValue(1)
      mockFindById.mockResolvedValue(buildUser())

      const result = await refreshTokens(
        { refreshToken: "valid.token" },
        repo,
        () => ({ jti: "old-jti", userId: 1 }),
        mockGenerators
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ accessToken: "new.access", refreshToken: "new.refresh" })
      }
      expect(mockFindById).toHaveBeenCalledWith(1)
      expect(mockDelete).toHaveBeenCalledWith("old-jti")
      expect(mockSave).toHaveBeenCalledWith("new-jti", 1, expect.any(Number))
    })

    it("旧 jti → 発行したペアを 30 秒の猶予で残してから、旧 jti を破棄する", async () => {
      mockFindUserId.mockResolvedValue(1)
      mockFindById.mockResolvedValue(buildUser())

      await refreshTokens({ refreshToken: "valid.token" }, repo, verifyRefreshTokenStub, mockGenerators)

      expect(mockSaveRotatedTokens).toHaveBeenCalledWith("old-jti", ROTATED_TOKENS, 30)
      /**
       * 旧 jti が消えて見えるときに猶予の記録が必ずあるよう、破棄より先に残す
       */
      expect(mockSaveRotatedTokens.mock.invocationCallOrder[0]).toBeLessThan(mockDelete.mock.invocationCallOrder[0])
    })

    it("猶予の間に同じ旧 Refresh Token が来たら、発行済みの同じペアを返し、新しく発行・保存・破棄しない", async () => {
      stubFindUserId({ "new-jti": 1 })
      mockFindRotatedTokens.mockResolvedValue(ROTATED_TOKENS)
      mockFindById.mockResolvedValue(buildUser())

      const result = await refreshTokens({ refreshToken: "valid.token" }, repo, verifyRefreshTokenStub, mockGenerators)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ accessToken: "new.access", refreshToken: "new.refresh" })
      }
      expect(mockFindRotatedTokens).toHaveBeenCalledWith("old-jti")
      expect(mockGenerators.generateAccessToken).not.toHaveBeenCalled()
      expect(mockGenerators.generateRefreshToken).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
      expect(mockSaveRotatedTokens).not.toHaveBeenCalled()
      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("検証失敗時、401 UNAUTHORIZED を返す", async () => {
      const result = await refreshTokens(
        { refreshToken: "broken" },
        repo,
        () => null,
        mockGenerators
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("Redis に jti も猶予の記録も無い場合（猶予を過ぎた再利用）、401 UNAUTHORIZED を返す", async () => {
      mockFindUserId.mockResolvedValue(null)
      mockFindRotatedTokens.mockResolvedValue(null)

      const result = await refreshTokens(
        { refreshToken: "revoked" },
        repo,
        () => ({ jti: "old-jti", userId: 1 }),
        mockGenerators
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockFindRotatedTokens).toHaveBeenCalledWith("old-jti")
      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("猶予の間でも、発行したペアが失効していれば（ログアウト済み）401 UNAUTHORIZED を返す", async () => {
      stubFindUserId({})
      mockFindRotatedTokens.mockResolvedValue(ROTATED_TOKENS)
      mockFindById.mockResolvedValue(buildUser())

      const result = await refreshTokens({ refreshToken: "valid.token" }, repo, verifyRefreshTokenStub, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockFindUserId).toHaveBeenCalledWith("new-jti")
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("猶予の間でも、発行したペアの userId が旧 Refresh Token と一致しなければ 401 UNAUTHORIZED を返す", async () => {
      stubFindUserId({ "new-jti": 2 })
      mockFindRotatedTokens.mockResolvedValue(ROTATED_TOKENS)
      mockFindById.mockResolvedValue(buildUser())

      const result = await refreshTokens({ refreshToken: "valid.token" }, repo, verifyRefreshTokenStub, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
      }
    })

    it("猶予の間でも、ユーザーが削除済みなら 401 UNAUTHORIZED を返し、発行済みのペアを返さない", async () => {
      stubFindUserId({ "new-jti": 1 })
      mockFindRotatedTokens.mockResolvedValue(ROTATED_TOKENS)
      mockFindById.mockResolvedValue(null)

      const result = await refreshTokens({ refreshToken: "valid.token" }, repo, verifyRefreshTokenStub, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockFindById).toHaveBeenCalledWith(1)
      expect(mockGenerators.generateAccessToken).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("userId が一致しない場合、401 UNAUTHORIZED を返す", async () => {
      mockFindUserId.mockResolvedValue(2)

      const result = await refreshTokens(
        { refreshToken: "mismatch" },
        repo,
        () => ({ jti: "old-jti", userId: 1 }),
        mockGenerators
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
      }
      expect(mockDelete).not.toHaveBeenCalled()
      expect(mockFindRotatedTokens).not.toHaveBeenCalled()
    })

    it("ユーザーが削除済みの場合、401 UNAUTHORIZED を返して旧 jti を消し、新しい token は発行・保存しない", async () => {
      mockFindUserId.mockResolvedValue(1)
      mockFindById.mockResolvedValue(null)

      const result = await refreshTokens(
        { refreshToken: "deleted-user" },
        repo,
        () => ({ jti: "old-jti", userId: 1 }),
        mockGenerators
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockDelete).toHaveBeenCalledWith("old-jti")
      expect(mockGenerators.generateAccessToken).not.toHaveBeenCalled()
      expect(mockGenerators.generateRefreshToken).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
      expect(mockSaveRotatedTokens).not.toHaveBeenCalled()
    })
  })
})
