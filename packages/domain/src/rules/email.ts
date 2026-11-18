/**
 * 大文字小文字や前後の空白だけが違う email を、照合と登録で同じ email として扱うためにそろえる
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
