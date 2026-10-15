import { ADMIN_QUESTION_REVIEW_MIN_ANSWERS } from "../const/admin-stats"

type QuestionChoiceCounts = { answerCount: number, choiceCounts: number[], correctChoiceIndex: number }

/**
 * 正解でないのに、正解と同じかそれ以上選ばれた選択肢の番号（admin-dashboard README「問題の分析」。画面ではこの選択肢を橙にする）。
 * その設問の期間内の解答が ADMIN_QUESTION_REVIEW_MIN_ANSWERS 件より少なければ空。1 度も選ばれていない選択肢は数えない
 */
export const findMisleadingChoiceIndexes = (input: QuestionChoiceCounts): number[] => {
  if (input.answerCount < ADMIN_QUESTION_REVIEW_MIN_ANSWERS) return []
  const correctCount = input.choiceCounts[input.correctChoiceIndex] ?? 0
  return input.choiceCounts.flatMap((count, index) => (index !== input.correctChoiceIndex && count > 0 && count >= correctCount ? [index] : []))
}

/**
 * 要確認の設問か（正解でないのに、正解と同じかそれ以上選ばれた選択肢がある）。判定は findMisleadingChoiceIndexes と同じ
 */
export const isQuestionNeedingReview = (input: QuestionChoiceCounts): boolean => findMisleadingChoiceIndexes(input).length > 0
