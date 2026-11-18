import { QUESTION_TYPES } from "../const/question"
import type { QuestionType } from "../types/question"

export const isQuestionType = (value: string): value is QuestionType =>
  (QUESTION_TYPES as readonly string[]).includes(value)
