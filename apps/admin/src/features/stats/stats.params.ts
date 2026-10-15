import { type AdminPassageStatsSort, adminPassageStatsSortSchema, type AdminStatsPeriod, adminStatsPeriodSchema } from "@repo/api-schema"

/**
 * ダッシュボードの URL のクエリ（?period=&sort=&order=&page=&q=）。Server Component で読む（Zod のスキーマを使うので Client Component からは使わない）
 */
export type DashboardQuery = {
  order: "asc" | "desc"
  page: number
  period: AdminStatsPeriod
  q?: string
  sort: AdminPassageStatsSort
}

type SearchParams = Record<string, string | string[] | undefined>

const DEFAULT_QUERY: DashboardQuery = { order: "desc", page: 1, period: "30d", sort: "solved_users" }

/**
 * 同じ名前のクエリが 2 つ以上あれば最初の値を使う
 */
const pickFirst = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * URL の期間を読む。不正・未指定は直近 30 日
 */
export const convertSearchParamToPeriod = (value: string | string[] | undefined): AdminStatsPeriod => {
  const parsed = adminStatsPeriodSchema.safeParse(pickFirst(value))
  return parsed.success ? parsed.data : DEFAULT_QUERY.period
}

/**
 * URL のクエリを読む。不正・未指定は既定値（直近 30 日・解いた人数の多い順・1 ページ目）
 */
export const convertSearchParamsToDashboardQuery = (params: SearchParams): DashboardQuery => {
  const sort = adminPassageStatsSortSchema.safeParse(pickFirst(params.sort))
  const page = Number(pickFirst(params.page))
  const q = pickFirst(params.q)?.trim()
  return {
    order: pickFirst(params.order) === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : DEFAULT_QUERY.page,
    period: convertSearchParamToPeriod(params.period),
    q: q ? q.slice(0, 200) : undefined,
    sort: sort.success ? sort.data : DEFAULT_QUERY.sort,
  }
}

/**
 * ダッシュボードの URL。既定値のクエリは省く
 */
export const buildDashboardHref = (query: DashboardQuery): string => {
  const params = new URLSearchParams({ period: query.period })
  if (query.sort !== DEFAULT_QUERY.sort) params.set("sort", query.sort)
  if (query.order !== DEFAULT_QUERY.order) params.set("order", query.order)
  if (query.q) params.set("q", query.q)
  if (query.page !== DEFAULT_QUERY.page) params.set("page", String(query.page))
  return `/?${params.toString()}`
}

/**
 * 問題の分析の URL（ダッシュボードと同じ期間）
 */
export const buildPassageAnalyticsHref = (passageId: number, period: AdminStatsPeriod): string =>
  `/analytics/passages/${passageId}?period=${period}`
