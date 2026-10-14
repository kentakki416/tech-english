import type { User, UserGoal } from "@repo/domain"

import type { UpsertUserGoalInput, UserGoalRepository, UserRepository } from "../../../src/repository"

/**
 * goal-service のユニットテストで共有する値とモック
 */

export const USER: User = {
  id: 7,
  avatarUrl: null,
  email: "learner@example.com",
  name: "Learner",
  timezone: "Asia/Tokyo",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
}

export const GOAL_INPUT: UpsertUserGoalInput = {
  goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
  targetDate: "2027-03-31",
  weeklyMetric: "passages",
  weeklyTarget: 5,
}

export const buildUserGoal = (overrides: Partial<UserGoal> = {}): UserGoal => ({
  id: 1,
  ...GOAL_INPUT,
  userId: USER.id,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
})

export const createMockUserRepository = () => ({
  create: vi.fn<UserRepository["create"]>(),
  deleteById: vi.fn<UserRepository["deleteById"]>(),
  findByEmail: vi.fn<UserRepository["findByEmail"]>(),
  findById: vi.fn<UserRepository["findById"]>(),
  updateProfile: vi.fn<UserRepository["updateProfile"]>(),
  updateTimezone: vi.fn<UserRepository["updateTimezone"]>(),
})

export const createMockUserGoalRepository = () => ({
  findByUserId: vi.fn<UserGoalRepository["findByUserId"]>(),
  upsertByUserId: vi.fn<UserGoalRepository["upsertByUserId"]>(),
})
