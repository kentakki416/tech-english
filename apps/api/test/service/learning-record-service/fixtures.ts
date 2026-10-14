import type { User, UserGoal } from "@repo/domain"

import type { LearningRecordRepository, SubmittedAttempt, UserGoalRepository, UserRepository } from "../../../src/repository"

/**
 * learning-record-service のユニットテストで共有する値とモック
 */

/**
 * Asia/Tokyo では 2026-10-11（日曜）の 00:30
 */
export const FIXED_NOW = new Date("2026-10-10T15:30:00.000Z")

export const USER: User = {
  id: 7,
  avatarUrl: null,
  email: "learner@example.com",
  name: "Learner",
  timezone: "Asia/Tokyo",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
}

export const createMockUserRepository = () => ({
  create: vi.fn<UserRepository["create"]>(),
  deleteById: vi.fn<UserRepository["deleteById"]>(),
  findByEmail: vi.fn<UserRepository["findByEmail"]>(),
  findById: vi.fn<UserRepository["findById"]>(),
  updateProfile: vi.fn<UserRepository["updateProfile"]>(),
  updateTimezone: vi.fn<UserRepository["updateTimezone"]>(),
})

/**
 * 既定は挑戦が 0 件のときの値を返す
 */
export const createMockLearningRecordRepository = () => ({
  findStudyDates: vi.fn<LearningRecordRepository["findStudyDates"]>().mockResolvedValue([]),
  findSubmittedAttempts: vi.fn<LearningRecordRepository["findSubmittedAttempts"]>().mockResolvedValue([]),
  summarizeAccuracyByQuestionType: vi.fn<LearningRecordRepository["summarizeAccuracyByQuestionType"]>().mockResolvedValue([]),
  summarizeByDate: vi.fn<LearningRecordRepository["summarizeByDate"]>().mockResolvedValue([]),
  summarizeNoAssistAccuracy: vi
    .fn<LearningRecordRepository["summarizeNoAssistAccuracy"]>()
    .mockResolvedValue({ correctCount: 0, questionCount: 0 }),
  summarizeTotals: vi.fn<LearningRecordRepository["summarizeTotals"]>().mockResolvedValue({
    attemptCount: 0,
    correctCount: 0,
    passageCount: 0,
    questionCount: 0,
    studySeconds: 0,
  }),
})

/**
 * 既定は目標が未設定
 */
export const createMockUserGoalRepository = () => ({
  findByUserId: vi.fn<UserGoalRepository["findByUserId"]>().mockResolvedValue(null),
  upsertByUserId: vi.fn<UserGoalRepository["upsertByUserId"]>(),
})

export const buildSubmittedAttempt = (overrides: Partial<SubmittedAttempt> = {}): SubmittedAttempt => ({
  id: 301,
  correctCount: 3,
  elapsedSeconds: 312,
  isOvertime: false,
  listenedBlockCount: 0,
  passageId: 11,
  passageTitle: "Synchronizing with Effects",
  questionCount: 4,
  studyDate: "2026-10-10",
  submittedAt: new Date("2026-10-09T23:14:00.000Z"),
  translatedBlockCount: 0,
  wordLookupCount: 0,
  ...overrides,
})

export const buildUserGoal = (overrides: Partial<UserGoal> = {}): UserGoal => ({
  id: 1,
  goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
  targetDate: "2027-03-31",
  userId: USER.id,
  weeklyMetric: "passages",
  weeklyTarget: 5,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
})
