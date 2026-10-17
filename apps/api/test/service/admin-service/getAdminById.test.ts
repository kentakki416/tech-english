import { Admin } from "@repo/domain"

import { AdminRepository } from "../../../src/repository"
import { getAdminById } from "../../../src/service/admin-service"

const mockFindById = vi.fn<(_0: number) => Promise<Admin | null>>()
const mockAdminRepository: AdminRepository = {
  findByEmail: vi.fn(),
  findById: mockFindById,
  recordSignIn: vi.fn(),
}

const admin: Admin = {
  id: 3,
  avatarUrl: null,
  email: "admin@example.com",
  lastSignedInAt: null,
  name: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}

describe("getAdminById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("admin を返す", async () => {
      mockFindById.mockResolvedValue(admin)

      expect(await getAdminById(3, { adminRepository: mockAdminRepository })).toEqual({ ok: true, value: admin })
    })
  })

  describe("異常系", () => {
    it("admins にいなければ 401（消された admin のトークンは使えない）", async () => {
      mockFindById.mockResolvedValue(null)

      const result = await getAdminById(3, { adminRepository: mockAdminRepository })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(401)
    })
  })
})
