import { ADMIN_QUESTION_REVIEW_MIN_ANSWERS } from "@repo/domain"

/**
 * 正解でない選択肢が、正解と同じかそれ以上選ばれているか（admin-dashboard README「問題の分析」）。
 * その設問の期間内の解答が ADMIN_QUESTION_REVIEW_MIN_ANSWERS 件より少なければ false。1 度も選ばれていない選択肢は数えない
 */
export const isQuestionNeedingReview = (input: { answerCount: number; choiceCounts: number[]; correctChoiceIndex: number }): boolean => {
  if (input.answerCount < ADMIN_QUESTION_REVIEW_MIN_ANSWERS) return false
  const correctCount = input.choiceCounts[input.correctChoiceIndex] ?? 0
  return input.choiceCounts.some((count, index) => index !== input.correctChoiceIndex && count > 0 && count >= correctCount)
}
