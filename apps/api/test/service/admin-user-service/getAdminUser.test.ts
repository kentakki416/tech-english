import { getAdminUser } from "../../../src/service/admin-user-service"

import { createMockAdminUserRepo, FIXED_NOW, USER } from "./fixtures"

describe("getAdminUser", () => {
  describe("正常系", () => {
    it("基本の情報に、ログイン方法・最後に学習した日・マイページと同じ学習のまとめ・単語帳の数を足す", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.authAccountRepository.findProvidersByUserId.mockResolvedValue(["github", "google"])
      repo.learningRecordRepository.findStudyDates.mockResolvedValue(["2026-10-01", "2026-10-09"])

      const result = await getAdminUser(USER.id, repo, { now: FIXED_NOW })

      expect(repo.authAccountRepository.findProvidersByUserId).toHaveBeenCalledWith(USER.id)
      expect(result).toMatchObject({
        ok: true,
        value: {
          stats: { today: "2026-10-11", totals: { attemptCount: 0 } },
          user: { ...USER, lastStudiedDate: "2026-10-09", providers: ["github", "google"] },
          vocabulary: expect.any(Object),
        },
      })
    })

    it("学習していなければ最後に学習した日は null", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      const result = await getAdminUser(USER.id, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ ok: true, value: { user: { lastStudiedDate: null, providers: [] } } })
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければ 404（マイページの Service の 401 にはしない）", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await getAdminUser(999, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ error: { statusCode: 404 }, ok: false })
      expect(repo.authAccountRepository.findProvidersByUserId).not.toHaveBeenCalled()
    })
  })
})
