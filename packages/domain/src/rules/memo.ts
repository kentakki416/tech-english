import type { MembershipTier } from "../types/membership-tier"

export const canShareMemo = (tier: MembershipTier): boolean => tier === "silver" || tier === "gold"
