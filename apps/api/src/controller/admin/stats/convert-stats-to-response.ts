import type { AdminPassageStatsRowResponse } from "@repo/api-schema"

import type { AdminPassageStats, AttemptRates } from "../../../service/admin-stats-service"

/**
 * アシストの利用率（キーを snake_case に）
 */
export const convertAssistRatesToResponse = (rates: AttemptRates["assistRates"]) => ({
  listened: rates.listened,
  looked_up: rates.lookedUp,
  translated: rates.translated,
  translated_question: rates.translatedQuestion,
})

/**
 * 問題ごとの成績の 1 行（公開日時は ISO 8601）
 */
export const convertPassageStatsToResponse = (stats: AdminPassageStats): AdminPassageStatsRowResponse => ({
  id: stats.id,
  assist_rates: convertAssistRatesToResponse(stats.assistRates),
  average_elapsed_seconds: stats.averageElapsedSeconds,
  correct_rate: stats.correctRate,
  difficulty: stats.difficulty,
  overtime_rate: stats.overtimeRate,
  published_at: stats.publishedAt?.toISOString() ?? null,
  solved_attempts: stats.solvedAttempts,
  solved_users: stats.solvedUsers,
  source: stats.source,
  status: stats.status,
  time_limit_seconds: stats.timeLimitSeconds,
  title: stats.title,
})
