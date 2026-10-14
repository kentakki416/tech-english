/**
 * 設問の種類。1 つの問題に 2 種類以上を混ぜる
 *
 * - main_idea: 要旨
 * - detail: 詳細
 * - vocabulary: 文脈での語義（対象の語句を用語集と紐づける）
 * - inference: 推論
 * - purpose: 筆者の意図
 */
export const QUESTION_TYPES = ["main_idea", "detail", "vocabulary", "inference", "purpose"] as const

/**
 * 1 問あたりの選択肢の数
 */
export const QUESTION_CHOICE_COUNT = 4

/**
 * 1 つの問題の設問数の下限
 */
export const MIN_QUESTIONS_PER_PASSAGE = 3

/**
 * 1 つの問題の設問数の上限
 */
export const MAX_QUESTIONS_PER_PASSAGE = 5
