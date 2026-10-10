import { AuthAccountWithUser, User } from "@repo/domain"

import { GetGitHubUserInfoInput, GitHubUserInfo, IGitHubOAuthClient } from "../../../src/client/github-oauth"
import {
  AuthAccountRepository,
  RefreshTokenRepository,
  type TransactionContext,
  type TransactionRunner,
  UpdateUserProfileInput,
  UserRepository,
} from "../../../src/repository"
import { authenticateWithGitHub } from "../../../src/service/auth-service"

const mockGetUserInfo = vi.fn<(_0: GetGitHubUserInfoInput) => Promise<GitHubUserInfo | null>>()
const mockGitHubOAuthClient: IGitHubOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const mockFindByProvider = vi.fn<(_0: string, _1: string) => Promise<AuthAccountWithUser | null>>()
const mockAuthAccountCreate = vi.fn<(
  _0: Parameters<AuthAccountRepository["create"]>[0],
  _1?: TransactionContext,
) => Promise<unknown>>()
const mockAuthAccountRepository: AuthAccountRepository = {
  create: mockAuthAccountCreate as never,
  findByProvider: mockFindByProvider,
}

const mockUserCreate = vi.fn<(
  _0: Parameters<UserRepository["create"]>[0],
  _1?: TransactionContext,
) => Promise<User>>()
const mockFindByEmail = vi.fn<(_0: string) => Promise<User | null>>()
const mockUpdateProfile = vi.fn<(_0: number, _1: UpdateUserProfileInput) => Promise<User>>()
const mockUserRepository: UserRepository = {
  create: mockUserCreate,
  findByEmail: mockFindByEmail,
  findById: vi.fn(),
  updateProfile: mockUpdateProfile,
  updateTimezone: vi.fn(),
}

const mockRefreshTokenSave = vi.fn<(_0: string, _1: number, _2: number) => Promise<void>>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: vi.fn(),
  findUserId: vi.fn(),
  save: mockRefreshTokenSave,
}

/**
 * Fake TransactionRunner: tx を渡さずそのまま callback を実行する（authenticateWithGoogle のテストと同じ）
 */
const mockTransactionRunner: TransactionRunner = {
  run: vi.fn(async (fn) => fn(undefined as unknown as TransactionContext)),
}

const mockRepository = {
  authAccountRepository: mockAuthAccountRepository,
  refreshTokenRepository: mockRefreshTokenRepository,
  transactionRunner: mockTransactionRunner,
  userRepository: mockUserRepository,
}

const mockTokenGenerators = {
  generateAccessToken: vi.fn((_userId: number) => "access.jwt"),
  generateRefreshToken: vi.fn((_userId: number) => ({ jti: "uuid-1", token: "refresh.jwt" })),
}

const INPUT = {
  code: "auth-code",
  codeVerifier: "v".repeat(43),
  redirectUri: "http://localhost:3000/api/auth/callback/github",
  timezone: "America/New_York",
}

const buildGitHubUser = (overrides?: Partial<GitHubUserInfo>): GitHubUserInfo => ({
  id: "12345",
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  email: "octocat@example.com",
  login: "octocat",
  name: "The Octocat",
  ...overrides,
})

const buildUser = (overrides?: Partial<User>): User => ({
  id: 1,
  avatarUrl: "https://avatars.githubusercontent.com/u/12345",
  email: "octocat@example.com",
  name: "The Octocat",
  timezone: "Asia/Tokyo",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const buildAuthAccount = (user: User): AuthAccountWithUser => ({
  id: 10,
  provider: "github",
  providerAccountId: "12345",
  user,
  userId: user.id,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe("authenticateWithGitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("正常系", () => {
    it("既存アカウントの場合、表示名とアイコンを最新化し isNewUser=false で Token を発行する", async () => {
      const existingUser = buildUser({ avatarUrl: "https://example.com/old.png", name: "Old Name" })
      const updatedUser = buildUser()
      mockGetUserInfo.mockResolvedValue(buildGitHubUser())
      mockFindByProvider.mockResolvedValue(buildAuthAccount(existingUser))
      mockUpdateProfile.mockResolvedValue(updatedUser)

      const result = await authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          accessToken: "access.jwt",
          isNewUser: false,
          refreshToken: "refresh.jwt",
          user: updatedUser,
        })
      }
      expect(mockGetUserInfo).toHaveBeenCalledWith({
        code: INPUT.code,
        codeVerifier: INPUT.codeVerifier,
        redirectUri: INPUT.redirectUri,
      })
      expect(mockFindByProvider).toHaveBeenCalledWith("github", "12345")
      expect(mockUpdateProfile).toHaveBeenCalledWith(existingUser.id, {
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        name: "The Octocat",
      })
      expect(mockTransactionRunner.run).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
      expect(mockAuthAccountCreate).not.toHaveBeenCalled()
      expect(mockRefreshTokenSave).toHaveBeenCalledWith("uuid-1", updatedUser.id, expect.any(Number))
    })

    it("GitHub の name が null の場合、login を表示名にする", async () => {
      const existingUser = buildUser()
      mockGetUserInfo.mockResolvedValue(buildGitHubUser({ name: null }))
      mockFindByProvider.mockResolvedValue(buildAuthAccount(existingUser))
      mockUpdateProfile.mockResolvedValue(buildUser({ name: "octocat" }))

      const result = await authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators)

      expect(result.ok).toBe(true)
      expect(mockUpdateProfile).toHaveBeenCalledWith(existingUser.id, {
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        name: "octocat",
      })
    })

    it("新規の場合、tx 内で email / timezone 付きの User と provider=github の AuthAccount を作成する", async () => {
      const newUser = buildUser({ id: 2, timezone: "America/New_York" })
      mockGetUserInfo.mockResolvedValue(buildGitHubUser())
      mockFindByProvider.mockResolvedValue(null)
      mockFindByEmail.mockResolvedValue(null)
      mockUserCreate.mockResolvedValue(newUser)
      mockAuthAccountCreate.mockResolvedValue(undefined)

      const result = await authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          accessToken: "access.jwt",
          isNewUser: true,
          refreshToken: "refresh.jwt",
          user: newUser,
        })
      }
      expect(mockFindByEmail).toHaveBeenCalledWith("octocat@example.com")
      expect(mockTransactionRunner.run).toHaveBeenCalledTimes(1)
      /** fake runner は tx として undefined を渡すので、第2引数は undefined */
      expect(mockUserCreate).toHaveBeenCalledWith(
        {
          avatarUrl: "https://avatars.githubusercontent.com/u/12345",
          email: "octocat@example.com",
          name: "The Octocat",
          timezone: "America/New_York",
        },
        undefined,
      )
      expect(mockAuthAccountCreate).toHaveBeenCalledWith(
        {
          provider: "github",
          providerAccountId: "12345",
          userId: 2,
        },
        undefined,
      )
      expect(mockUpdateProfile).not.toHaveBeenCalled()
      expect(mockRefreshTokenSave).toHaveBeenCalledWith("uuid-1", 2, expect.any(Number))
    })

    it("新規でメールが別ユーザーと一致する場合、email を持たないユーザーを作り既存ユーザーには触れない", async () => {
      const emailOwner = buildUser({ id: 1, email: "octocat@example.com" })
      const newUser = buildUser({ id: 2, email: null })
      mockGetUserInfo.mockResolvedValue(buildGitHubUser())
      mockFindByProvider.mockResolvedValue(null)
      mockFindByEmail.mockResolvedValue(emailOwner)
      mockUserCreate.mockResolvedValue(newUser)
      mockAuthAccountCreate.mockResolvedValue(undefined)

      const result = await authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.user).toEqual(newUser)
        expect(result.value.isNewUser).toBe(true)
      }
      expect(mockUserCreate).toHaveBeenCalledWith(
        {
          avatarUrl: "https://avatars.githubusercontent.com/u/12345",
          email: undefined,
          name: "The Octocat",
          timezone: "America/New_York",
        },
        undefined,
      )
      expect(mockAuthAccountCreate).toHaveBeenCalledWith(
        { provider: "github", providerAccountId: "12345", userId: 2 },
        undefined,
      )
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })

    it("GitHub のメールが null の場合、findByEmail を呼ばずに email なしで作成する", async () => {
      const newUser = buildUser({ id: 2, email: null })
      mockGetUserInfo.mockResolvedValue(buildGitHubUser({ avatarUrl: null, email: null }))
      mockFindByProvider.mockResolvedValue(null)
      mockUserCreate.mockResolvedValue(newUser)
      mockAuthAccountCreate.mockResolvedValue(undefined)

      const result = await authenticateWithGitHub(
        { ...INPUT, timezone: undefined },
        mockRepository,
        mockGitHubOAuthClient,
        mockTokenGenerators,
      )

      expect(result.ok).toBe(true)
      expect(mockFindByEmail).not.toHaveBeenCalled()
      expect(mockUserCreate).toHaveBeenCalledWith(
        {
          avatarUrl: undefined,
          email: undefined,
          name: "The Octocat",
          timezone: undefined,
        },
        undefined,
      )
    })
  })

  describe("異常系", () => {
    it("getUserInfo が null の場合、401 UNAUTHORIZED を返し Repository とトークン保存は呼ばない", async () => {
      mockGetUserInfo.mockResolvedValue(null)

      const result = await authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(mockFindByProvider).not.toHaveBeenCalled()
      expect(mockFindByEmail).not.toHaveBeenCalled()
      expect(mockUserCreate).not.toHaveBeenCalled()
      expect(mockUpdateProfile).not.toHaveBeenCalled()
      expect(mockAuthAccountCreate).not.toHaveBeenCalled()
      expect(mockTokenGenerators.generateAccessToken).not.toHaveBeenCalled()
      expect(mockRefreshTokenSave).not.toHaveBeenCalled()
    })

    it("getUserInfo が throw した場合、そのまま reject する", async () => {
      mockGetUserInfo.mockRejectedValue(new Error("network"))

      await expect(
        authenticateWithGitHub(INPUT, mockRepository, mockGitHubOAuthClient, mockTokenGenerators),
      ).rejects.toThrow()
      expect(mockFindByProvider).not.toHaveBeenCalled()
      expect(mockRefreshTokenSave).not.toHaveBeenCalled()
    })
  })
})
