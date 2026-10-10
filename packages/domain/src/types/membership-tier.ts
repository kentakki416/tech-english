import type { MEMBERSHIP_TIERS } from "../const/membership-tier"

/**
 * 会員種別
 */
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number]
