import { getAdminUserAttempts } from "../../../src/service/admin-user-service"

import { createMockAdminUserRepo, USER } from "./fixtures"

describe("getAdminUserAttempts", () => {
  describe("正常系", () => {
    it("ユーザーが居れば、マイページと同じ学習履歴を返す", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      expect(await getAdminUserAttempts(USER.id, { limit: 10 }, repo)).toEqual({ ok: true, value: { attempts: [], nextCursor: null } })
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければ 404", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(null)

      expect(await getAdminUserAttempts(999, { limit: 10 }, repo)).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })

    it("確かめた後に退会してマイページの Service が 401 を返しても、404 にする", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValueOnce(USER).mockResolvedValueOnce(null)

      expect(await getAdminUserAttempts(USER.id, { limit: 10 }, repo)).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })
  })
})
