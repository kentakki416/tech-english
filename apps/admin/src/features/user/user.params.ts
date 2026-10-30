import "server-only"

import { type GetAdminUserListQueryString, getAdminUserListQueryStringSchema } from "@repo/api-schema"

import { convertSearchParamBySchema, convertSearchParamToKeyword, type SearchParams } from "@/libs/search-params"

/**
 * ユーザー一覧の URL のクエリ（?sort=&order=&page=&q=）。項目・既定値・検証は API のクエリのスキーマに従い、件数（limit）は API の既定値に任せる。
 * Zod のスキーマを使うので server-only（Client Component から import するとビルドで落ちる）
 */
export type UserListQuery = Omit<GetAdminUserListQueryString, "limit">

const QUERY_FIELDS = getAdminUserListQueryStringSchema.shape

const USER_LIST_KEYWORD_MAX_LENGTH = QUERY_FIELDS.q.unwrap().maxLength

/**
 * 既定値（登録日の新しい順・1 ページ目）
 */
const DEFAULT_QUERY: UserListQuery = getAdminUserListQueryStringSchema.omit({ limit: true }).parse({})

/**
 * URL のクエリを読む。不正・未指定は既定値、絞り込みの文字は API の上限で切り詰める
 */
export const convertSearchParamsToUserListQuery = (params: SearchParams): UserListQuery => ({
  order: convertSearchParamBySchema(QUERY_FIELDS.order, params.order, DEFAULT_QUERY.order),
  page: convertSearchParamBySchema(QUERY_FIELDS.page, params.page, DEFAULT_QUERY.page),
  q: convertSearchParamToKeyword(params.q, USER_LIST_KEYWORD_MAX_LENGTH),
  sort: convertSearchParamBySchema(QUERY_FIELDS.sort, params.sort, DEFAULT_QUERY.sort),
})

/**
 * ユーザー一覧の URL のクエリ。既定値の項目は省く
 */
const buildUserListSearchParams = (query: UserListQuery): URLSearchParams => {
  const params = new URLSearchParams()
  if (query.sort !== DEFAULT_QUERY.sort) params.set("sort", query.sort)
  if (query.order !== DEFAULT_QUERY.order) params.set("order", query.order)
  if (query.q) params.set("q", query.q)
  if (query.page !== DEFAULT_QUERY.page) params.set("page", String(query.page))
  return params
}

/**
 * ユーザー一覧の URL（`/users?sort=solved_attempts`）。既定値の項目は省く
 */
export const buildUserListHref = (query: UserListQuery): string => {
  const search = buildUserListSearchParams(query).toString()
  return search ? `/users?${search}` : "/users"
}

/**
 * 絞り込みのフォームで残すクエリ（並べ替え。既定値は省く。ページは 1 に戻す）
 */
export const buildUserListSearchFormValues = (query: UserListQuery): Record<string, string> =>
  Object.fromEntries(buildUserListSearchParams({ ...query, page: DEFAULT_QUERY.page, q: undefined }))
