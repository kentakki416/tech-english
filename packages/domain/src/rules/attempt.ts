import { ATTEMPT_STATUSES, WORD_LOOKUP_SOURCES } from "../const/attempt"
import type { AttemptStatus, WordLookupSource } from "../types/attempt"

/**
 * 挑戦の状態の値かどうか
 */
export const isAttemptStatus = (value: string): value is AttemptStatus =>
  (ATTEMPT_STATUSES as readonly string[]).includes(value)

/**
 * 調べた単語の出どころの値かどうか
 */
export const isWordLookupSource = (value: string): value is WordLookupSource =>
  (WORD_LOOKUP_SOURCES as readonly string[]).includes(value)
