import { eq, userGoals } from "@repo/db"

import { DrizzleUserGoalRepository } from "../../src/repository/drizzle/user-goal-repository"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testDb } from "../controller/setup"
import { insertUserGoal } from "../fixture/learning-record"
import { insertAttemptUser } from "../fixture/passage"

const userGoalRepository = new DrizzleUserGoalRepository(testDb)

const GOAL_INPUT = {
  goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
  targetDate: "2027-03-31",
  weeklyMetric: "passages" as const,
  weeklyTarget: 5,
}

const selectGoalRows = async (userId: number) => testDb.select().from(userGoals).where(eq(userGoals.userId, userId))

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("UserGoalRepository", () => {
  describe("findByUserId", () => {
    describe("正常系", () => {
      it("そのユーザーの目標を返す（target_date は YYYY-MM-DD の文字列）", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        const row = await insertUserGoal(user.id, { goalText: "辞書なしで読む", targetDate: "2027-03-31", weeklyMetric: "minutes", weeklyTarget: 60 })
        await insertUserGoal(otherUser.id, { goalText: "他のユーザーの目標" })

        expect(await userGoalRepository.findByUserId(user.id)).toEqual({
          id: row.id,
          goalText: "辞書なしで読む",
          targetDate: "2027-03-31",
          userId: user.id,
          weeklyMetric: "minutes",
          weeklyTarget: 60,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      })

      it("すべての項目が空の目標も返す", async () => {
        const user = await insertAttemptUser()
        const row = await insertUserGoal(user.id, { goalText: null, targetDate: null, weeklyMetric: null, weeklyTarget: null })

        expect(await userGoalRepository.findByUserId(user.id)).toEqual({
          id: row.id,
          goalText: null,
          targetDate: null,
          userId: user.id,
          weeklyMetric: null,
          weeklyTarget: null,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      })
    })

    describe("異常系", () => {
      it("目標が未設定なら null", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        await insertUserGoal(otherUser.id)

        expect(await userGoalRepository.findByUserId(user.id)).toBeNull()
      })
    })
  })

  describe("upsertByUserId", () => {
    describe("正常系", () => {
      it("行が無ければ作成し、findByUserId で同じ値が取れる（targetDate は YYYY-MM-DD の文字列）", async () => {
        const user = await insertAttemptUser()

        const saved = await userGoalRepository.upsertByUserId(user.id, GOAL_INPUT)

        expect(saved).toEqual({
          id: expect.any(Number),
          ...GOAL_INPUT,
          userId: user.id,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
        expect(await userGoalRepository.findByUserId(user.id)).toEqual(saved)
        const rows = await selectGoalRows(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: saved.id, ...GOAL_INPUT, userId: user.id })
      })

      it("2 回目は同じ行を上書きし、行は 1 つのまま。null を渡した項目は null になる", async () => {
        const user = await insertAttemptUser()
        const first = await userGoalRepository.upsertByUserId(user.id, GOAL_INPUT)

        const second = await userGoalRepository.upsertByUserId(user.id, {
          goalText: null,
          targetDate: null,
          weeklyMetric: "minutes",
          weeklyTarget: 60,
        })

        expect(second).toEqual({
          id: first.id,
          goalText: null,
          targetDate: null,
          userId: user.id,
          weeklyMetric: "minutes",
          weeklyTarget: 60,
          createdAt: first.createdAt,
          updatedAt: expect.any(Date),
        })
        expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime())
        const rows = await selectGoalRows(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ id: first.id, goalText: null, targetDate: null, weeklyMetric: "minutes", weeklyTarget: 60 })
      })

      it("他のユーザーの目標は変えない", async () => {
        const user = await insertAttemptUser()
        const otherUser = await insertAttemptUser()
        const others = await insertUserGoal(otherUser.id, { goalText: "他のユーザーの目標" })

        await userGoalRepository.upsertByUserId(user.id, GOAL_INPUT)

        expect(await selectGoalRows(otherUser.id)).toEqual([others])
      })
    })

    describe("異常系", () => {
      it("weeklyMetric だけ指定して weeklyTarget が null だと CHECK 違反で throw し、行を作らない", async () => {
        const user = await insertAttemptUser()

        await expect(
          userGoalRepository.upsertByUserId(user.id, { ...GOAL_INPUT, weeklyMetric: "passages", weeklyTarget: null }),
        ).rejects.toThrow()
        expect(await selectGoalRows(user.id)).toHaveLength(0)
      })

      it("存在しない userId は外部キー違反で throw する", async () => {
        await expect(userGoalRepository.upsertByUserId(999_999, GOAL_INPUT)).rejects.toThrow()
        expect(await testDb.$count(userGoals)).toBe(0)
      })
    })
  })
})
