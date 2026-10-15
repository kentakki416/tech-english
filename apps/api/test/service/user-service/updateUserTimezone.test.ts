import { User } from "@repo/domain"

import { UserRepository } from "../../../src/repository"
import { updateUserTimezone } from "../../../src/service/user-service"

const mockFindById = vi.fn<(_0: number) => Promise<User | null>>()
const mockUpdateTimezone = vi.fn<(_0: number, _1: string) => Promise<User>>()

const mockUserRepository: UserRepository = {
  create: vi.fn(),
  deleteById: vi.fn(),
  findByEmail: vi.fn(),
  findById: mockFindById,
  findForAdmin: vi.fn(),
  updateProfile: vi.fn(),
  updateTimezone: mockUpdateTimezone,
}

const buildUser = (overrides?: Partial<User>): User => ({
  id: 1,
  avatarUrl: "https://example.com/avatar.jpg",
  email: "test@example.com",
  name: "Test User",
  timezone: "Asia/Tokyo",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe("updateUserTimezone", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("ユーザーが存在する場合、タイムゾーンを更新して更新後の User を返す", async () => {
      const updatedUser = buildUser({ timezone: "UTC" })
      mockFindById.mockResolvedValue(buildUser())
      mockUpdateTimezone.mockResolvedValue(updatedUser)

      const result = await updateUserTimezone(1, { timezone: "UTC" }, { userRepository: mockUserRepository })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual(updatedUser)
      }
      expect(mockFindById).toHaveBeenCalledWith(1)
      expect(mockUpdateTimezone).toHaveBeenCalledWith(1, "UTC")
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しない場合、401 UNAUTHORIZED を返し updateTimezone を呼ばない", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await updateUserTimezone(999, { timezone: "UTC" }, { userRepository: mockUserRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockUpdateTimezone).not.toHaveBeenCalled()
    })

    it("データベースエラー時に例外が伝播する", async () => {
      mockFindById.mockRejectedValue(new Error("Database connection failed"))

      await expect(
        updateUserTimezone(1, { timezone: "UTC" }, { userRepository: mockUserRepository }),
      ).rejects.toThrow()
      expect(mockUpdateTimezone).not.toHaveBeenCalled()
    })
  })
})
