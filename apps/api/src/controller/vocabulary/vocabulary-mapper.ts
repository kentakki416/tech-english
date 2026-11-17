import type { GetVocabularySummaryResponse } from "@repo/api-schema"

import type { VocabularyCounts } from "../../repository"

export const convertVocabularySummaryToResponse = (counts: VocabularyCounts): GetVocabularySummaryResponse => ({
  due_count: counts.dueCount,
  learning_count: counts.learningCount,
  mastered_count: counts.masteredCount,
  new_count: counts.newCount,
  next_due_date: counts.nextDueDate,
})
