"use server"

import { type ReviewVocabularyCardRequest, reviewVocabularyCardRequestSchema } from "@repo/api-schema"

import { vocabularyApi } from "@/features/vocabulary/vocabulary.api"

/**
 * 保存できたかだけを返す。saved のときは答えた後の段階と次に出す日
 */
export type ReviewVocabularyCardActionResult =
  | { dueDate: string | null, stage: number, status: "saved" }
  | { status: "failed" }

/**
 * 1 枚の答えを保存する。revalidatePath は呼ばない（1 枚ごとに 1 回分の画面を描き直さないため。
 * トップとマイページは cookie を読む動的な画面なので、開き直せば新しい数になる）
 */
export const reviewVocabularyCardAction = async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardActionResult> => {
  const parsed = reviewVocabularyCardRequestSchema.safeParse(input)
  if (!parsed.success) return { status: "failed" }
  try {
    const card = await vocabularyApi.review(parsed.data)
    return { dueDate: card.due_date, stage: card.stage, status: "saved" }
  } catch {
    return { status: "failed" }
  }
}
