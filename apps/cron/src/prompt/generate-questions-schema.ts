import { z } from "zod/v4"

import { PASSAGE_DIFFICULTIES, QUESTION_CHOICE_COUNT, QUESTION_TYPES } from "@repo/domain"

import { convertZodToStructuredOutputSchema } from "../client/anthropic"

/**
 * 問題生成の LLM の出力のスキーマ。キーは README の「LLM の呼び出し」の表のとおり camelCase。
 *
 * zod は 3.25 だが、Zod から JSON Schema を作る `z.toJSONSchema` が v4 にしか無いので、このファイルは `zod/v4` で書く。
 * structured output は省略可能なキーより nullable の方が扱いやすいので、任意の値は null で表す。
 * description は JSON Schema に入ってモデルへの指示になる（短く保つ）
 */

const blockIndexSchema = z.number().int().min(0).describe("0-based block index (the index attribute of <block>)")

const blockRefSchema = z.object({
  blockIndex: blockIndexSchema,
  surface: z.string().min(1).describe("The word or phrase exactly as it appears in the block text"),
})

export const generatedQuestionSchema = z.object({
  choices: z
    .array(z.string().trim().min(1))
    .length(QUESTION_CHOICE_COUNT)
    .describe("Exactly 4 answer choices in English. Exactly one is correct"),
  choicesJa: z
    .array(z.string().trim().min(1))
    .length(QUESTION_CHOICE_COUNT)
    .nullable()
    .describe("Japanese translations of choices in the same order. null for vocabulary questions"),
  correctChoiceIndex: z.number().int().min(0).max(QUESTION_CHOICE_COUNT - 1).describe("0-based index of the correct choice"),
  evidence: z.object({
    blockIndex: blockIndexSchema,
    quote: z.string().min(1).describe("Verbatim excerpt from the block text that supports the answer"),
  }),
  explanationJa: z.string().min(1).describe("Explanation in Japanese"),
  prompt: z.string().min(1).describe("Question text in English"),
  promptJa: z.string().trim().min(1).describe("Japanese translation of prompt"),
  type: z.enum(QUESTION_TYPES),
  vocabularyTarget: blockRefSchema
    .nullable()
    .describe("The target word or phrase for vocabulary questions. null for other types"),
})

export const glossaryItemSchema = blockRefSchema.extend({
  lemma: z.string().min(1).describe("Dictionary form"),
  meaningJa: z.string().min(1).describe("The one meaning in this context, in Japanese"),
  noteJa: z.string().nullable().describe("Optional short note in Japanese"),
  partOfSpeech: z.string().min(1),
})

export const translationSchema = z.object({
  blockIndex: blockIndexSchema,
  translationJa: z.string().min(1),
})

/**
 * refine を付ける前のオブジェクト。JSON Schema はここから作る（refine は JSON Schema に表せない）
 */
const generateQuestionsOutputObjectSchema = z.object({
  difficulty: z.literal(PASSAGE_DIFFICULTIES),
  glossary: z.array(glossaryItemSchema),
  isSuitable: z.boolean(),
  questions: z.array(generatedQuestionSchema),
  translations: z.array(translationSchema),
  unsuitableReason: z.string().nullable().describe("Reason in Japanese when isSuitable is false. null otherwise"),
})

/**
 * LLM の出力の検証に使う。形だけを見る（設問数・選択肢の重複・ブロック番号の範囲などの本文と突き合わせる検査は step3 の validateGeneratedOutput）
 */
export const generateQuestionsOutputSchema = generateQuestionsOutputObjectSchema.superRefine((output, ctx) => {
  /**
   * vocabulary の設問だけが対象語句を持ち、選択肢の和訳を持たない（和訳から答えが分かるため）
   */
  output.questions.forEach((question, index) => {
    const isVocabulary = question.type === "vocabulary"
    if (isVocabulary !== (question.vocabularyTarget !== null)) {
      ctx.addIssue({
        code: "custom",
        message: isVocabulary
          ? "vocabularyTarget is required for vocabulary questions"
          : "vocabularyTarget must be null for non-vocabulary questions",
        path: ["questions", index, "vocabularyTarget"],
      })
    }
    if (isVocabulary !== (question.choicesJa === null)) {
      ctx.addIssue({
        code: "custom",
        message: isVocabulary
          ? "choicesJa must be null for vocabulary questions"
          : "choicesJa is required for non-vocabulary questions",
        path: ["questions", index, "choicesJa"],
      })
    }
  })
})

export type GenerateQuestionsOutput = z.infer<typeof generateQuestionsOutputSchema>

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>

/**
 * API の structured output に渡す JSON Schema。キーの順序を揺らさないよう、モジュールの読み込み時に 1 回だけ作る
 */
export const GENERATE_QUESTIONS_OUTPUT_JSON_SCHEMA = convertZodToStructuredOutputSchema(generateQuestionsOutputObjectSchema)
