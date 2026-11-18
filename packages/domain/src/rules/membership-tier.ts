import { MEMBERSHIP_TIERS } from "../const/membership-tier"
import type { MembershipTier } from "../types/membership-tier"

export const isMembershipTier = (value: string): value is MembershipTier =>
  (MEMBERSHIP_TIERS as readonly string[]).includes(value)
