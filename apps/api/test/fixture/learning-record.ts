import { attemptAnswers, userGoals } from "@repo/db"

import { testDb } from "../controller/setup"

import { insertReadingAttempt } from "./passage"

/**
 * 学習記録（learning-record）のテスト用のヘルパー。Repository のテストと Controller のインテグレーションテストで使う。
 * 問題（passages・設問）は test/fixture/passage.ts の insertGeneratedPassage などで先に入れる
 */

type CreateSubmittedAttemptInput = {
  /**
   * 設問ごとの正誤（questionIds と同じ順）。省略するとすべて正解
   */
  correctness?: boolean[]
  /**
   * 省略すると 150 秒
   */
  elapsedSeconds?: number
  isOvertime?: boolean
  listenedBlockCount?: number
  passageId: number
  /**
   * 回答（attempt_answers）を入れる設問。question_count はこの数になる
   */
  questionIds: number[]
  /**
   * 設問ごとの選んだ選択肢（questionIds と同じ順。null は未回答）。省略すると正解は 1・不正解は 0
   */
  selectedChoiceIndexes?: (number | null)[]
  studyDate: string
  /**
   * 省略すると study_date の 03:00Z（JST の 12:00）
   */
  submittedAt?: Date
  translatedBlockCount?: number
  userId: number
  wordLookupCount?: number
}

/**
 * 提出済みの挑戦を、設問ごとの回答（attempt_answers）つきで入れる。correct_count / question_count は回答から決める
 */
export const createSubmittedAttempt = async (input: CreateSubmittedAttemptInput) => {
  const correctness = input.correctness ?? input.questionIds.map(() => true)
  const elapsedSeconds = input.elapsedSeconds ?? 150
  const submittedAt = input.submittedAt ?? new Date(`${input.studyDate}T03:00:00.000Z`)
  const attempt = await insertReadingAttempt(input.passageId, {
    correctCount: correctness.filter(Boolean).length,
    elapsedSeconds,
    isOvertime: input.isOvertime ?? false,
    listenedBlockCount: input.listenedBlockCount ?? 0,
    questionCount: input.questionIds.length,
    startedAt: new Date(submittedAt.getTime() - elapsedSeconds * 1000),
    status: "submitted",
    studyDate: input.studyDate,
    submittedAt,
    translatedBlockCount: input.translatedBlockCount ?? 0,
    userId: input.userId,
    wordLookupCount: input.wordLookupCount ?? 0,
  })
  if (input.questionIds.length > 0) {
    await testDb.insert(attemptAnswers).values(
      input.questionIds.map((questionId, index) => ({
        attemptId: attempt.id,
        isCorrect: correctness[index] ?? false,
        questionId,
        selectedChoiceIndex: input.selectedChoiceIndexes ? input.selectedChoiceIndexes[index] ?? null : correctness[index] ? 1 : 0,
      })),
    )
  }
  return attempt
}

/**
 * 目標を入れる
 */
export const insertUserGoal = async (userId: number, overrides: Partial<typeof userGoals.$inferInsert> = {}) => {
  const [row] = await testDb
    .insert(userGoals)
    .values({
      goalText: "英語の公式ドキュメントを辞書なしで読めるようになる",
      targetDate: "2027-03-31",
      weeklyMetric: "passages",
      weeklyTarget: 5,
      ...overrides,
      userId,
    })
    .returning()
  return row
}
