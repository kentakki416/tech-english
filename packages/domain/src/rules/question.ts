import { QUESTION_TYPES } from "../const/question"
import type { QuestionType } from "../types/question"

/**
 * 設問の種類の値かどうか
 */
export const isQuestionType = (value: string): value is QuestionType =>
  (QUESTION_TYPES as readonly string[]).includes(value)
