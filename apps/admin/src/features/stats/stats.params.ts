import "server-only"

import { type AdminStatsPeriod, type GetAdminPassageStatsListQueryString, getAdminPassageStatsListQueryStringSchema } from "@repo/api-schema"

import { convertSearchParamBySchema, convertSearchParamToKeyword, type SearchParams, type SearchParamValue } from "@/libs/search-params"

/**
 * ダッシュボードの URL のクエリ（?period=&sort=&order=&page=&q=）。項目・既定値・検証は API のクエリのスキーマに従い、件数（limit）は API の既定値に任せる。
 * Zod のスキーマを使うので server-only（Client Component から import するとビルドで落ちる）
 */
export type DashboardQuery = Omit<GetAdminPassageStatsListQueryString, "limit">

const QUERY_FIELDS = getAdminPassageStatsListQueryStringSchema.shape

/**
 * 既定値（直近 30 日・解いた人数の多い順・1 ページ目）
 */
const DEFAULT_QUERY: DashboardQuery = getAdminPassageStatsListQueryStringSchema.omit({ limit: true }).parse({})

/**
 * URL の期間を読む。不正・未指定は既定値
 */
export const convertSearchParamToPeriod = (value: SearchParamValue): AdminStatsPeriod =>
  convertSearchParamBySchema(QUERY_FIELDS.period, value, DEFAULT_QUERY.period)

/**
 * URL のクエリを読む。不正・未指定は既定値、絞り込みの文字は API の上限で切り詰める
 */
export const convertSearchParamsToDashboardQuery = (params: SearchParams): DashboardQuery => ({
  order: convertSearchParamBySchema(QUERY_FIELDS.order, params.order, DEFAULT_QUERY.order),
  page: convertSearchParamBySchema(QUERY_FIELDS.page, params.page, DEFAULT_QUERY.page),
  period: convertSearchParamToPeriod(params.period),
  q: convertSearchParamToKeyword(params.q, QUERY_FIELDS.q.unwrap().maxLength),
  sort: convertSearchParamBySchema(QUERY_FIELDS.sort, params.sort, DEFAULT_QUERY.sort),
})

/**
 * ダッシュボードの URL のクエリ。既定値の項目は省く（渡さなかった項目は既定値）
 */
const buildDashboardSearchParams = (query: Partial<DashboardQuery>): URLSearchParams => {
  const merged = { ...DEFAULT_QUERY, ...query }
  const params = new URLSearchParams()
  if (merged.period !== DEFAULT_QUERY.period) params.set("period", merged.period)
  if (merged.sort !== DEFAULT_QUERY.sort) params.set("sort", merged.sort)
  if (merged.order !== DEFAULT_QUERY.order) params.set("order", merged.order)
  if (merged.q) params.set("q", merged.q)
  if (merged.page !== DEFAULT_QUERY.page) params.set("page", String(merged.page))
  return params
}

/**
 * ダッシュボードの URL（`/?period=7d&sort=correct_rate`）。既定値の項目は省く
 */
export const buildDashboardHref = (query: Partial<DashboardQuery>): string => {
  const search = buildDashboardSearchParams(query).toString()
  return search ? `/?${search}` : "/"
}

/**
 * 絞り込みのフォームで残すクエリ（期間・並べ替え。既定値は省く。ページは 1 に戻す）
 */
export const buildDashboardSearchFormValues = (query: DashboardQuery): Record<string, string> =>
  Object.fromEntries(buildDashboardSearchParams({ ...query, page: DEFAULT_QUERY.page, q: undefined }))

/**
 * 問題の分析の URL（ダッシュボードと同じ期間。既定値なら省く）
 */
export const buildPassageAnalyticsHref = (passageId: number, period: AdminStatsPeriod): string =>
  period === DEFAULT_QUERY.period ? `/analytics/passages/${passageId}` : `/analytics/passages/${passageId}?period=${period}`
