import { ATTEMPT_EXPIRY_SECONDS } from "@repo/domain"

export const calculateExpiresAt = (startedAt: Date): Date => new Date(startedAt.getTime() + ATTEMPT_EXPIRY_SECONDS * 1000)

/**
 * 期限内の境目。これより後に開始した in_progress だけが期限内
 */
export const calculateAliveSince = (now: Date): Date => new Date(now.getTime() - ATTEMPT_EXPIRY_SECONDS * 1000)

export const isAttemptExpired = (startedAt: Date, now: Date): boolean =>
  now.getTime() >= calculateExpiresAt(startedAt).getTime()
