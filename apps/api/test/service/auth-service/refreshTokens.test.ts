import { User } from "@repo/domain"

import { RefreshTokenRepository, UserRepository } from "../../../src/repository"
import { refreshTokens } from "../../../src/service/auth-service"

const mockDelete = vi.fn<(_0: string) => Promise<void>>()
const mockFindUserId = vi.fn<(_0: string) => Promise<number | null>>()
const mockSave = vi.fn<(_0: string, _1: number, _2: number) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: mockDelete,
  findUserId: mockFindUserId,
  save: mockSave,
}

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUserRepository: UserRepository = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findByEmail: vi.fn(),
  findById: mockFindById,
  updateProfile: vi.fn(),
  updateTimezone: vi.fn(),
}

const repo = { refreshTokenRepository: mockRefreshTokenRepository, userRepository: mockUserRepository }

const mockGenerators = {
  generateAccessToken: vi.fn((_userId: number) => "new.access"),
  generateRefreshToken: vi.fn((_userId: number) => ({ jti: "new-jti", token: "new.refresh" })),
}

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

    it("Redis に jti が無い場合（再利用検知）、401 UNAUTHORIZED を返す", async () => {
      mockFindUserId.mockResolvedValue(null)

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
      expect(mockDelete).not.toHaveBeenCalled()
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
    })
  })
})
