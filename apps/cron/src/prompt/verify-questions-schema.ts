import { z } from "zod/v4"

import { QUESTION_CHOICE_COUNT } from "@repo/domain"

import { convertZodToStructuredOutputSchema } from "../client/anthropic"

/**
 * 解答キーを見ない検証の出力のスキーマ。generate-questions-schema.ts と同じく、JSON Schema を作るため `zod/v4` で書く
 */
export const verifyQuestionsOutputSchema = z.object({
  answers: z.array(
    z.object({
      choiceIndex: z
        .number()
        .int()
        .min(0)
        .max(QUESTION_CHOICE_COUNT - 1)
        .describe("0-based index of the chosen choice (0 = A, 1 = B, 2 = C, 3 = D)"),
      questionNumber: z.number().int().min(1).describe("The number attribute of <question>"),
    }),
  ).describe("One answer for every question"),
})

export type VerifyQuestionsOutput = z.infer<typeof verifyQuestionsOutputSchema>

/**
 * API の structured output に渡す JSON Schema。モジュールの読み込み時に 1 回だけ作る
 */
export const VERIFY_QUESTIONS_OUTPUT_JSON_SCHEMA = convertZodToStructuredOutputSchema(verifyQuestionsOutputSchema)
