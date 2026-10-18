import { Admin } from "@repo/domain"

import { AdminRepository, RecordAdminSignInInput, RefreshTokenRepository } from "../../../src/repository"
import { loginAsDevAdmin } from "../../../src/service/admin-auth-service"

const mockFindByEmail = vi.fn<(_0: string) => Promise<Admin | null>>()
const mockRecordSignIn = vi.fn<(_0: number, _1: RecordAdminSignInInput) => Promise<Admin>>()
const mockAdminRepository: AdminRepository = {
  findByEmail: mockFindByEmail,
  findById: vi.fn(),
  recordSignIn: mockRecordSignIn,
}

const mockSave = vi.fn<(_0: string, _1: number, _2: number) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: vi.fn(),
  findRotatedTokens: vi.fn(),
  findUserId: vi.fn(),
  save: mockSave,
  saveRotatedTokens: vi.fn(),
}

const mockGenerators = {
  generateAccessToken: vi.fn((_adminId: number) => "admin.access"),
  generateRefreshToken: vi.fn((_adminId: number) => ({ jti: "admin-jti", token: "admin.refresh" })),
}

const devAdmin: Admin = {
  id: 1,
  avatarUrl: null,
  email: "admin@dev.local",
  lastSignedInAt: null,
  name: "Admin (dev)",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}

const repo = { adminRepository: mockAdminRepository, refreshTokenRepository: mockRefreshTokenRepository }

describe("loginAsDevAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("@dev.local の admin なら、最終サインイン日時だけを更新してトークンを発行する", async () => {
      mockFindByEmail.mockResolvedValue(devAdmin)
      const signedIn = { ...devAdmin, lastSignedInAt: new Date() }
      mockRecordSignIn.mockResolvedValue(signedIn)

      const result = await loginAsDevAdmin({ email: "Admin@Dev.Local" }, repo, mockGenerators)

      expect(result).toEqual({
        ok: true,
        value: { accessToken: "admin.access", admin: signedIn, refreshToken: "admin.refresh" },
      })
      expect(mockFindByEmail).toHaveBeenCalledWith("admin@dev.local")
      expect(mockRecordSignIn).toHaveBeenCalledWith(1, { signedInAt: expect.any(Date) })
      expect(mockSave).toHaveBeenCalledWith("admin-jti", 1, expect.any(Number))
    })
  })

  describe("異常系", () => {
    it("@dev.local 以外の email は、admins にいても 404 で、admins を引かない", async () => {
      mockFindByEmail.mockResolvedValue({ ...devAdmin, id: 2, email: "admin@example.com" })

      const result = await loginAsDevAdmin({ email: "admin@example.com" }, repo, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(404)
      expect(mockFindByEmail).not.toHaveBeenCalled()
      expect(mockRecordSignIn).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("@dev.local が途中にあるだけの email は 404", async () => {
      const result = await loginAsDevAdmin({ email: "admin@dev.local.example.com" }, repo, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(404)
      expect(mockFindByEmail).not.toHaveBeenCalled()
    })

    it("@dev.local でも admins にいなければ 404 で、トークンを保存しない", async () => {
      mockFindByEmail.mockResolvedValue(null)

      const result = await loginAsDevAdmin({ email: "nobody@dev.local" }, repo, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(404)
      expect(mockRecordSignIn).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })
  })
})
