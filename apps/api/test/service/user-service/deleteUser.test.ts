import { User } from "@repo/domain"

import { RefreshTokenRepository, UserRepository } from "../../../src/repository"
import { deleteUser } from "../../../src/service/user-service"

const mockDeleteById = vi.fn<(_0: number) => Promise<void>>()
const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUserRepository: UserRepository = {
  create: vi.fn(),
  deleteById: mockDeleteById,
  findByEmail: vi.fn(),
  findById: mockFindById,
  findForAdmin: vi.fn(),
  updateProfile: vi.fn(),
  updateTimezone: vi.fn(),
}

const mockRefreshTokenDelete = vi.fn<(_0: string) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: mockRefreshTokenDelete,
  findRotatedTokens: vi.fn(),
  findUserId: vi.fn(),
  save: vi.fn(),
  saveRotatedTokens: vi.fn(),
}

const repo = { refreshTokenRepository: mockRefreshTokenRepository, userRepository: mockUserRepository }

/**
 * "own.refresh" は本人（userId 1）、"other.refresh" は他人（userId 2）の token として検証できる。それ以外は検証失敗
 */
const verifier = (token: string): { jti: string; userId: number } | null => {
  if (token === "own.refresh") return { jti: "own-jti", userId: 1 }
  if (token === "other.refresh") return { jti: "other-jti", userId: 2 }
  return null
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

describe("deleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteById.mockResolvedValue(undefined)
    mockRefreshTokenDelete.mockResolvedValue(undefined)
  })

  describe("正常系", () => {
    it("ユーザーがいれば deleteById を呼び、本人の refresh token の jti を失効させる", async () => {
      mockFindById.mockResolvedValue(buildUser())

      const result = await deleteUser(1, { refreshToken: "own.refresh" }, repo, verifier)

      expect(result).toEqual({ ok: true, value: undefined })
      expect(mockDeleteById).toHaveBeenCalledWith(1)
      expect(mockRefreshTokenDelete).toHaveBeenCalledWith("own-jti")
    })

    it("ユーザーが既に無い場合、deleteById を呼ばずに成功し、jti は失効させる", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await deleteUser(1, { refreshToken: "own.refresh" }, repo, verifier)

      expect(result).toEqual({ ok: true, value: undefined })
      expect(mockDeleteById).not.toHaveBeenCalled()
      expect(mockRefreshTokenDelete).toHaveBeenCalledWith("own-jti")
    })

    it.each([
      ["他人の refresh token", "other.refresh"],
      ["検証できない refresh token", "broken.refresh"],
    ])("%sは失効させずに成功する", async (_label, refreshToken) => {
      mockFindById.mockResolvedValue(buildUser())

      const result = await deleteUser(1, { refreshToken }, repo, verifier)

      expect(result).toEqual({ ok: true, value: undefined })
      expect(mockDeleteById).toHaveBeenCalledWith(1)
      expect(mockRefreshTokenDelete).not.toHaveBeenCalled()
    })

    it("refreshToken を省略しても成功する", async () => {
      mockFindById.mockResolvedValue(buildUser())

      const result = await deleteUser(1, {}, repo, verifier)

      expect(result).toEqual({ ok: true, value: undefined })
      expect(mockDeleteById).toHaveBeenCalledWith(1)
      expect(mockRefreshTokenDelete).not.toHaveBeenCalled()
    })
  })

  describe("異常系", () => {
    it("DB の削除に失敗した場合、例外が伝播し jti は失効させない", async () => {
      mockFindById.mockResolvedValue(buildUser())
      mockDeleteById.mockRejectedValue(new Error("Database connection failed"))

      await expect(deleteUser(1, { refreshToken: "own.refresh" }, repo, verifier)).rejects.toThrow()
      expect(mockRefreshTokenDelete).not.toHaveBeenCalled()
    })
  })
})
