import { getUserGoal } from "../../../src/service/goal-service"

import { buildUserGoal, createMockUserGoalRepository, USER } from "./fixtures"

describe("getUserGoal", () => {
  describe("正常系", () => {
    it("目標があればそのまま ok で返す", async () => {
      const userGoalRepository = createMockUserGoalRepository()
      const goal = buildUserGoal()
      userGoalRepository.findByUserId.mockResolvedValue(goal)

      const result = await getUserGoal(USER.id, { userGoalRepository })

      expect(result).toEqual({ ok: true, value: goal })
      expect(userGoalRepository.findByUserId).toHaveBeenCalledWith(USER.id)
    })

    it("行が無ければ ok(null)", async () => {
      const userGoalRepository = createMockUserGoalRepository()
      userGoalRepository.findByUserId.mockResolvedValue(null)

      const result = await getUserGoal(USER.id, { userGoalRepository })

      expect(result).toEqual({ ok: true, value: null })
    })
  })

  describe("異常系", () => {
    it("データベースエラー時に例外が伝播する", async () => {
      const userGoalRepository = createMockUserGoalRepository()
      userGoalRepository.findByUserId.mockRejectedValue(new Error("Database connection failed"))

      await expect(getUserGoal(USER.id, { userGoalRepository })).rejects.toThrow()
    })
  })
})
