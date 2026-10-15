import { getAdminUserAttempts, getAdminUserCalendar } from "../../../src/service/admin-user-service"

import { createMockAdminUserRepo, FIXED_NOW, USER } from "./fixtures"

describe("getAdminUserCalendar・getAdminUserAttempts", () => {
  describe("正常系", () => {
    it("ユーザーが居れば、マイページと同じカレンダー・学習履歴を返す", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      const calendar = await getAdminUserCalendar(USER.id, { from: "2026-10-05", to: "2026-10-11" }, repo, { now: FIXED_NOW })
      const attempts = await getAdminUserAttempts(USER.id, { limit: 10 }, repo)

      expect(calendar).toMatchObject({ ok: true, value: { from: "2026-10-05", to: "2026-10-11", today: "2026-10-11" } })
      expect(attempts).toEqual({ ok: true, value: { attempts: [], nextCursor: null } })
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければどちらも 404", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(null)

      expect(await getAdminUserCalendar(999, {}, repo, { now: FIXED_NOW })).toMatchObject({ error: { statusCode: 404 }, ok: false })
      expect(await getAdminUserAttempts(999, { limit: 10 }, repo)).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })

    it("カレンダーの期間が不正なら、マイページと同じく 400", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      expect(await getAdminUserCalendar(USER.id, { from: "2026-10-05" }, repo, { now: FIXED_NOW })).toMatchObject({ error: { statusCode: 400 }, ok: false })
    })
  })
})
