import { User } from "@repo/domain"

import { UserRepository } from "../../../src/repository"
import { getUserById } from "../../../src/service/user-service"

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findByEmail: vi.fn(),
  findById: mockFindById,
  updateProfile: vi.fn(),
  updateTimezone: vi.fn(),
}

describe("getUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ユーザーが存在する場合、ok: true とユーザー情報を返す", async () => {
      const mockUser: User = {
        id: 1,
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
        timezone: "Asia/Tokyo",
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockFindById.mockResolvedValue(mockUser)

      const result = await getUserById(1, { userRepository: mockUserRepository })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(mockUser)
      }
      expect(mockFindById).toHaveBeenCalledWith(1)
      expect(mockFindById).toHaveBeenCalledTimes(1)
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しない場合（削除済みユーザーの access token）、401 UNAUTHORIZED を返す", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await getUserById(999, { userRepository: mockUserRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockFindById).toHaveBeenCalledWith(999)
    })

    it("データベースエラー時に例外が伝播する", async () => {
      mockFindById.mockRejectedValue(new Error("Database connection failed"))

      await expect(getUserById(1, { userRepository: mockUserRepository })).rejects.toThrow()
      expect(mockFindById).toHaveBeenCalledWith(1)
    })
  })
})
