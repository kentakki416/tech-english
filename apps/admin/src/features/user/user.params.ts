import { type AdminUserSort, adminUserSortSchema } from "@repo/api-schema"

/**
 * ユーザー一覧の URL のクエリ（?sort=&order=&page=&q=）。Server Component で読む（Zod のスキーマを使うので Client Component からは使わない）
 */
export type UserListQuery = {
  order: "asc" | "desc"
  page: number
  q?: string
  sort: AdminUserSort
}

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_QUERY: UserListQuery = { order: "desc", page: 1, sort: "created_at" }

/**
 * 同じ名前のクエリが 2 つ以上あれば最初の値を使う
 */
const pickFirst = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * URL のクエリを読む。不正・未指定は既定値（登録日の新しい順・1 ページ目）
 */
export const convertSearchParamsToUserListQuery = (params: SearchParams): UserListQuery => {
  const sort = adminUserSortSchema.safeParse(pickFirst(params.sort))
  const page = Number(pickFirst(params.page))
  const q = pickFirst(params.q)?.trim()
  return {
    order: pickFirst(params.order) === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : DEFAULT_QUERY.page,
    q: q ? q.slice(0, 200) : undefined,
    sort: sort.success ? sort.data : DEFAULT_QUERY.sort,
  }
}

/**
 * ユーザー一覧の URL。既定値のクエリは省く
 */
export const buildUserListHref = (query: UserListQuery): string => {
  const params = new URLSearchParams()
  if (query.sort !== DEFAULT_QUERY.sort) params.set("sort", query.sort)
  if (query.order !== DEFAULT_QUERY.order) params.set("order", query.order)
  if (query.q) params.set("q", query.q)
  if (query.page !== DEFAULT_QUERY.page) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `/users?${search}` : "/users"
}
