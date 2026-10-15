import type { GetVocabularySummaryResponse } from "@repo/api-schema"

import type { VocabularyCounts } from "../../repository"

/**
 * 単語帳のトップの数 → API の snake_case の形。単語帳（/api/vocabulary/summary）と admin のユーザーの詳細で共有する
 */
export const convertVocabularySummaryToResponse = (counts: VocabularyCounts): GetVocabularySummaryResponse => ({
  due_count: counts.dueCount,
  learning_count: counts.learningCount,
  mastered_count: counts.masteredCount,
  new_count: counts.newCount,
  next_due_date: counts.nextDueDate,
})
