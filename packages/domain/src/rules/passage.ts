import {
  PASSAGE_DIFFICULTIES,
  PASSAGE_STATUSES,
  READING_WPM_BY_DIFFICULTY,
  SECONDS_PER_QUESTION,
  TIME_LIMIT_ROUNDING_SECONDS,
} from "../const/passage"
import type { PassageDifficulty, PassageStatus } from "../types/passage"

export const isPassageStatus = (value: string): value is PassageStatus =>
  (PASSAGE_STATUSES as readonly string[]).includes(value)

export const isPassageDifficulty = (value: number): value is PassageDifficulty =>
  (PASSAGE_DIFFICULTIES as readonly number[]).includes(value)

/**
 * 本文の英単語数から設問数を決める（〜300 語: 3 問 / 301〜450 語: 4 問 / 451 語〜: 5 問）
 */
export const calculateQuestionCount = (wordCount: number): number => {
  if (wordCount <= 300) return 3
  if (wordCount <= 450) return 4
  return 5
}

/**
 * 制限時間（秒）。英単語数 ÷ 想定 WPM × 60 ＋ 設問数 × 40 を 30 秒単位に切り上げる。
 * 浮動小数の誤差で 30 秒ずれないよう、整数だけで計算する
 * （ceil((wordCount * 60 / wpm + questionCount * 40) / 30) * 30 の分母を払った形）
 */
export const calculateTimeLimitSeconds = (
  wordCount: number,
  difficulty: PassageDifficulty,
  questionCount: number,
): number => {
  const wpm = READING_WPM_BY_DIFFICULTY[difficulty]
  const numerator = wordCount * 60 + questionCount * SECONDS_PER_QUESTION * wpm
  return Math.ceil(numerator / (wpm * TIME_LIMIT_ROUNDING_SECONDS)) * TIME_LIMIT_ROUNDING_SECONDS
}
