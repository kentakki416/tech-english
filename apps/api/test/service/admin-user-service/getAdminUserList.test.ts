import { getAdminUserList } from "../../../src/service/admin-user-service"
import { createMockUserRepository } from "../learning-record-service/fixtures"

import { USER } from "./fixtures"

describe("getAdminUserList", () => {
  describe("正常系", () => {
    it("page から offset を求めて Repository に渡し、一覧と全体の件数を返す", async () => {
      const userRepository = createMockUserRepository()
      const item = { ...USER, lastStudiedDate: "2026-10-10", providers: ["github"], solvedAttempts: 3 }
      userRepository.findForAdmin.mockResolvedValue({ items: [item], total: 51 })

      const result = await getAdminUserList({ limit: 50, order: "desc", page: 2, q: "learn", sort: "created_at" }, { userRepository })

      expect(userRepository.findForAdmin).toHaveBeenCalledWith({ limit: 50, offset: 50, order: "desc", q: "learn", sort: "created_at" })
      expect(result).toEqual({ ok: true, value: { items: [item], limit: 50, page: 2, total: 51 } })
    })
  })

  describe("異常系", () => {
    it("該当が無ければ空の配列", async () => {
      const userRepository = createMockUserRepository()
      userRepository.findForAdmin.mockResolvedValue({ items: [], total: 0 })

      const result = await getAdminUserList({ limit: 50, order: "desc", page: 1, sort: "created_at" }, { userRepository })

      expect(result).toEqual({ ok: true, value: { items: [], limit: 50, page: 1, total: 0 } })
    })
  })
})
