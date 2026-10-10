import { MEMBERSHIP_TIERS } from "../const/membership-tier"
import type { MembershipTier } from "../types/membership-tier"

/**
 * 会員種別の値かどうか
 */
export const isMembershipTier = (value: string): value is MembershipTier =>
  (MEMBERSHIP_TIERS as readonly string[]).includes(value)
