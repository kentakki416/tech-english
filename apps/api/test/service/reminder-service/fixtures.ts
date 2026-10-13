import type { ReminderSetting, User } from "@repo/domain"

import type { ReminderSettingRepository, UpsertReminderSettingInput, UserRepository } from "../../../src/repository"

/**
 * reminder-service のユニットテストで共有する値とモック
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

export const REMINDER_INPUT: UpsertReminderSettingInput = {
  isEnabled: true,
  time: "21:15",
  weekdays: [1, 3, 5],
}

export const buildReminderSetting = (overrides: Partial<ReminderSetting> = {}): ReminderSetting => ({
  id: 1,
  ...REMINDER_INPUT,
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

export const createMockReminderSettingRepository = () => ({
  findByUserId: vi.fn<ReminderSettingRepository["findByUserId"]>(),
  upsertByUserId: vi.fn<ReminderSettingRepository["upsertByUserId"]>(),
})
