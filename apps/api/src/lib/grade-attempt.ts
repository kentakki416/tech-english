import type { Question } from "@repo/domain"

/**
 * 提出の採点と時間の計算（reading-practice README「時間の計測」）。DB を知らない純関数
 */

/**
 * 設問ごとの回答（null は未回答）
 */
export type AnswerInput = { questionId: number; selectedChoiceIndex: number | null }

/**
 * 採点した回答
 */
export type GradedAnswer = AnswerInput & { isCorrect: boolean }

/**
 * かかった時間。クライアントの申告値を 0 〜 壁時計（提出時刻 − 開始時刻、秒の切り捨て）に切り詰める。
 * 端末とサーバーの時計がずれて開始が未来になっていても 0 未満にはしない
 */
export const clampElapsedSeconds = (activeSeconds: number, startedAt: Date, now: Date): number =>
  Math.min(activeSeconds, Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000)))

/**
 * 時間超過か。制限時間ちょうどは超過ではない
 */
export const isOvertime = (elapsedSeconds: number, timeLimitSeconds: number): boolean => elapsedSeconds > timeLimitSeconds

/**
 * 全設問について、設問の順に回答を採点して返す。回答が無い設問・null は不正解。
 * 設問に無い questionId の回答は無視する（検証は呼び出し側で行う）
 */
export const gradeAnswers = (
  questions: Pick<Question, "correctChoiceIndex" | "id">[],
  answers: AnswerInput[],
): { answers: GradedAnswer[]; correctCount: number } => {
  const selectedByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer.selectedChoiceIndex]))
  const graded = questions.map((question): GradedAnswer => {
    const selectedChoiceIndex = selectedByQuestionId.get(question.id) ?? null
    return { isCorrect: selectedChoiceIndex === question.correctChoiceIndex, questionId: question.id, selectedChoiceIndex }
  })
  return { answers: graded, correctCount: graded.filter((answer) => answer.isCorrect).length }
}

/**
 * 読む速さ（英単語数 ÷ かかった分。四捨五入した整数）。かかった時間が 0 秒なら null
 */
export const calculateWordsPerMinute = (wordCount: number, elapsedSeconds: number): number | null =>
  elapsedSeconds === 0 ? null : Math.round((wordCount * 60) / elapsedSeconds)
