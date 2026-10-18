import type { GetAdminMeResponse } from "@repo/api-schema"

/**
 * 名前が無ければ（Google で一度もサインインしていない admin）email を出す
 */
export const resolveAdminDisplayName = (admin: Pick<GetAdminMeResponse, "email" | "name">): string =>
  admin.name || admin.email
