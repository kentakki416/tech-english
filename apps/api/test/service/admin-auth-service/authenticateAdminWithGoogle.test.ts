import { Admin } from "@repo/domain"

import { GoogleUserInfo, IGoogleOAuthClient } from "../../../src/client/google-oauth"
import { AdminRepository, RecordAdminSignInInput, RefreshTokenRepository } from "../../../src/repository"
import { authenticateAdminWithGoogle } from "../../../src/service/admin-auth-service"

const mockGetUserInfo = vi.fn<(_0: string, _1: string) => Promise<GoogleUserInfo>>()
const mockGoogleOAuthClient: IGoogleOAuthClient = { getUserInfo: mockGetUserInfo }

const mockFindByEmail = vi.fn<(_0: string) => Promise<Admin | null>>()
const mockFindById = vi.fn<(_0: number) => Promise<Admin | null>>()
const mockRecordSignIn = vi.fn<(_0: number, _1: RecordAdminSignInInput) => Promise<Admin>>()
const mockAdminRepository: AdminRepository = {
  findByEmail: mockFindByEmail,
  findById: mockFindById,
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

const admin: Admin = {
  id: 3,
  avatarUrl: null,
  email: "admin@example.com",
  lastSignedInAt: null,
  name: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
}

const googleUser: GoogleUserInfo = {
  email: "Admin@Example.com",
  emailVerified: true,
  id: "google-1",
  name: "Admin From Google",
  picture: "https://example.com/a.png",
}

const repo = { adminRepository: mockAdminRepository, refreshTokenRepository: mockRefreshTokenRepository }
const input = { code: "code", redirectUri: "http://localhost:3030/api/auth/callback/google" }

describe("authenticateAdminWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("Google で確認済みの email が admins にあれば、トークンを発行して更新後の admin を返す", async () => {
      mockGetUserInfo.mockResolvedValue(googleUser)
      mockFindByEmail.mockResolvedValue(admin)
      const signedIn = { ...admin, lastSignedInAt: new Date(), name: "Admin From Google" }
      mockRecordSignIn.mockResolvedValue(signedIn)

      const result = await authenticateAdminWithGoogle(input, repo, mockGoogleOAuthClient, mockGenerators)

      expect(result).toEqual({
        ok: true,
        value: { accessToken: "admin.access", admin: signedIn, refreshToken: "admin.refresh" },
      })
      /**
       * email の大文字小文字の違いを吸収して照合する
       */
      expect(mockFindByEmail).toHaveBeenCalledWith("admin@example.com")
      expect(mockRecordSignIn).toHaveBeenCalledWith(3, {
        profile: { avatarUrl: "https://example.com/a.png", name: "Admin From Google" },
        signedInAt: expect.any(Date),
      })
      expect(mockSave).toHaveBeenCalledWith("admin-jti", 3, expect.any(Number))
    })
  })

  describe("異常系", () => {
    it("Google で email が未確認なら 403 で、admins を引かずトークンも発行しない", async () => {
      mockGetUserInfo.mockResolvedValue({ ...googleUser, emailVerified: false })

      const result = await authenticateAdminWithGoogle(input, repo, mockGoogleOAuthClient, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(403)
      expect(mockFindByEmail).not.toHaveBeenCalled()
      expect(mockRecordSignIn).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })

    it("admins に email が無ければ 403 で、トークンを発行しない", async () => {
      mockGetUserInfo.mockResolvedValue(googleUser)
      mockFindByEmail.mockResolvedValue(null)

      const result = await authenticateAdminWithGoogle(input, repo, mockGoogleOAuthClient, mockGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.statusCode).toBe(403)
      expect(mockRecordSignIn).not.toHaveBeenCalled()
      expect(mockSave).not.toHaveBeenCalled()
    })
  })
})
