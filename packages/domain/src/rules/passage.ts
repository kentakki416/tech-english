import { PASSAGE_DIFFICULTIES, PASSAGE_STATUSES } from "../const/passage"
import type { PassageDifficulty, PassageStatus } from "../types/passage"

/**
 * 本文候補 / 問題の状態の値かどうか
 */
export const isPassageStatus = (value: string): value is PassageStatus =>
  (PASSAGE_STATUSES as readonly string[]).includes(value)

/**
 * 難易度の値かどうか
 */
export const isPassageDifficulty = (value: number): value is PassageDifficulty =>
  (PASSAGE_DIFFICULTIES as readonly number[]).includes(value)
