import { saveUserGoal } from "../../../src/service/goal-service"

import { buildUserGoal, createMockUserGoalRepository, createMockUserRepository, GOAL_INPUT, USER } from "./fixtures"

const setup = () => ({ userGoalRepository: createMockUserGoalRepository(), userRepository: createMockUserRepository() })

describe("saveUserGoal", () => {
  describe("正常系", () => {
    it("ユーザーが存在すれば upsertByUserId を呼び、保存後の目標を ok で返す", async () => {
      const repo = setup()
      const saved = buildUserGoal()
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.userGoalRepository.upsertByUserId.mockResolvedValue(saved)

      const result = await saveUserGoal(USER.id, GOAL_INPUT, repo)

      expect(result).toEqual({ ok: true, value: saved })
      expect(repo.userRepository.findById).toHaveBeenCalledWith(USER.id)
      expect(repo.userGoalRepository.upsertByUserId).toHaveBeenCalledWith(USER.id, GOAL_INPUT)
    })

    it("すべての項目が null でも保存する", async () => {
      const repo = setup()
      const input = { goalText: null, targetDate: null, weeklyMetric: null, weeklyTarget: null }
      const saved = buildUserGoal(input)
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.userGoalRepository.upsertByUserId.mockResolvedValue(saved)

      const result = await saveUserGoal(USER.id, input, repo)

      expect(result).toEqual({ ok: true, value: saved })
      expect(repo.userGoalRepository.upsertByUserId).toHaveBeenCalledWith(USER.id, input)
    })
  })

  describe("異常系", () => {
    it("ユーザーが存在しなければ UNAUTHORIZED（401）で、upsertByUserId を呼ばない", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(null)

      const result = await saveUserGoal(999, GOAL_INPUT, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.statusCode).toBe(401)
        expect(result.error.type).toBe("UNAUTHORIZED")
      }
      expect(repo.userGoalRepository.upsertByUserId).not.toHaveBeenCalled()
    })

    it("データベースエラー時に例外が伝播する", async () => {
      const repo = setup()
      repo.userRepository.findById.mockResolvedValue(USER)
      repo.userGoalRepository.upsertByUserId.mockRejectedValue(new Error("Database connection failed"))

      await expect(saveUserGoal(USER.id, GOAL_INPUT, repo)).rejects.toThrow()
    })
  })
})
