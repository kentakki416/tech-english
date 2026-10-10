import type { MembershipTier } from "../types/membership-tier"

/**
 * メモを共有できる会員種別かどうか（シルバー以上）
 */
export const canShareMemo = (tier: MembershipTier): boolean => tier === "silver" || tier === "gold"
