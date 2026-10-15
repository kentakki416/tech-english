import type { ADMIN_USER_SORTS } from "../const/admin-user"

/**
 * admin のユーザー一覧の並べ替えの列
 */
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number]
