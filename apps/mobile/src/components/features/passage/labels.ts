import type { AttemptQuestion, PassageListItemResponse } from "@repo/api-schema"

/**
 * 問題の表示ラベル（web の `labels.ts` と同じ）。値の集合は `@repo/api-schema` の型で網羅を検査する
 */

export type PassageDifficulty = PassageListItemResponse["difficulty"]

export type QuestionType = AttemptQuestion["type"]

export const DIFFICULTY_LABELS: Record<PassageDifficulty, string> = {
  1: "Easy",
  2: "Normal",
  3: "Hard",
}

/**
 * 難易度の並び（絞り込みのチップ）
 */
export const DIFFICULTY_ORDER = [1, 2, 3] as const satisfies readonly PassageDifficulty[]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  detail: "詳細",
  inference: "推論",
  main_idea: "要旨",
  purpose: "意図",
  vocabulary: "語義",
}
