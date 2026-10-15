import type { AdminStatsRepository, OverviewTotals, PassageStatsRow, QuestionStatsRow } from "../../../src/repository"

/**
 * 日本時間では 2026-10-15（木）の 12:00
 */
export const FIXED_NOW = new Date("2026-10-15T03:00:00.000Z")

export const EMPTY_TOTALS: OverviewTotals = {
  activeUsers: 0,
  correctCount: 0,
  elapsedSecondsSum: 0,
  listenedAttempts: 0,
  lookedUpAttempts: 0,
  newUsers: 0,
  overtimeAttempts: 0,
  questionCount: 0,
  solvedAttempts: 0,
  solvedUsers: 0,
  totalUsers: 0,
  translatedAttempts: 0,
}

export const buildPassageStatsRow = (overrides: Partial<PassageStatsRow> = {}): PassageStatsRow => ({
  id: 57,
  correctCount: 0,
  difficulty: 2,
  elapsedSecondsSum: 0,
  listenedAttempts: 0,
  lookedUpAttempts: 0,
  overtimeAttempts: 0,
  publishedAt: new Date("2026-09-28T00:00:00.000Z"),
  questionCount: 0,
  solvedAttempts: 0,
  solvedUsers: 0,
  source: { id: 3, name: "The Rust Programming Language" },
  status: "published",
  timeLimitSeconds: 360,
  title: "What Is Ownership?",
  translatedAttempts: 0,
  ...overrides,
})

export const buildQuestionStatsRow = (overrides: Partial<QuestionStatsRow> = {}): QuestionStatsRow => ({
  id: 571,
  answerCount: 0,
  choiceCounts: [0, 0, 0, 0],
  choices: ["A", "B", "C", "D"],
  correctChoiceIndex: 1,
  correctCount: 0,
  orderIndex: 0,
  prompt: "What is the main purpose of this passage?",
  type: "main_idea",
  unansweredCount: 0,
  ...overrides,
})

/**
 * 既定は誰も学習していないときの値を返す
 */
export const createMockAdminStatsRepository = () => ({
  findFirstUserCreatedAt: vi.fn<AdminStatsRepository["findFirstUserCreatedAt"]>().mockResolvedValue(null),
  findOverviewSeries: vi.fn<AdminStatsRepository["findOverviewSeries"]>().mockResolvedValue([]),
  findPassageStats: vi.fn<AdminStatsRepository["findPassageStats"]>().mockResolvedValue({ items: [], total: 0 }),
  findPassageStatsById: vi.fn<AdminStatsRepository["findPassageStatsById"]>().mockResolvedValue(null),
  findQuestionStats: vi.fn<AdminStatsRepository["findQuestionStats"]>().mockResolvedValue([]),
  summarizeOverview: vi.fn<AdminStatsRepository["summarizeOverview"]>().mockResolvedValue(EMPTY_TOTALS),
})
