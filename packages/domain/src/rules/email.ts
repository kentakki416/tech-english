/**
 * email の大文字小文字と前後の空白の差をなくす。
 * admins の照合（サインイン）と登録（admin:create・seed）の両方でこれにかけ、同じ形にそろえる
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
