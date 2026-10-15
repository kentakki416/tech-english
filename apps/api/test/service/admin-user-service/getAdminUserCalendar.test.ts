import { getAdminUserCalendar } from "../../../src/service/admin-user-service"

import { createMockAdminUserRepo, FIXED_NOW, USER } from "./fixtures"

describe("getAdminUserCalendar", () => {
  describe("正常系", () => {
    it("ユーザーが居れば、マイページと同じカレンダーを返す", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      const result = await getAdminUserCalendar(USER.id, { from: "2026-10-05", to: "2026-10-11" }, repo, { now: FIXED_NOW })

      expect(result).toMatchObject({ ok: true, value: { from: "2026-10-05", to: "2026-10-11", today: "2026-10-11" } })
    })
  })

  describe("異常系", () => {
    it("ユーザーが居なければ 404", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(null)

      expect(await getAdminUserCalendar(999, {}, repo, { now: FIXED_NOW })).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })

    it("確かめた後に退会してマイページの Service が 401 を返しても、404 にする", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValueOnce(USER).mockResolvedValueOnce(null)

      expect(await getAdminUserCalendar(USER.id, {}, repo, { now: FIXED_NOW })).toMatchObject({ error: { statusCode: 404 }, ok: false })
    })

    it("期間が不正なら、マイページと同じく 400 をそのまま返す", async () => {
      const repo = createMockAdminUserRepo()
      repo.userRepository.findById.mockResolvedValue(USER)

      expect(await getAdminUserCalendar(USER.id, { from: "2026-10-05" }, repo, { now: FIXED_NOW })).toMatchObject({ error: { statusCode: 400 }, ok: false })
    })
  })
})
