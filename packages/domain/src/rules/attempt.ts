import { ATTEMPT_STATUSES, WORD_LOOKUP_SOURCES } from "../const/attempt"
import type { AttemptStatus, WordLookupSource } from "../types/attempt"

export const isAttemptStatus = (value: string): value is AttemptStatus =>
  (ATTEMPT_STATUSES as readonly string[]).includes(value)

export const isWordLookupSource = (value: string): value is WordLookupSource =>
  (WORD_LOOKUP_SOURCES as readonly string[]).includes(value)
