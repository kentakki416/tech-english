import { type GetPassageListQueryString, getPassageListQueryStringSchema } from "@repo/api-schema"

/**
 * 問題一覧の絞り込みと URL のクエリの変換。Client Component の絞り込みからも使うので `server-only` を付けない
 */

/**
 * 絞り込みの条件（画面の URL・一覧の API・ランダムに 1 問で共通）
 */
export type PassageFilterQuery = {
  difficulty: GetPassageListQueryString["difficulty"]
  tag: GetPassageListQueryString["tag"]
  unattemptedOnly: GetPassageListQueryString["unattempted_only"]
}

export type PassageListQuery = PassageFilterQuery & { cursor?: string }

/**
 * 絞り込みなし
 */
export const EMPTY_PASSAGE_FILTER: PassageFilterQuery = {
  difficulty: [],
  tag: [],
  unattemptedOnly: false,
}

/**
 * 絞り込みの条件が 1 つでも付いているか（一覧が空のときに「絞り込みを解除する」を出すかの判定）
 */
export const isPassageFilterActive = (filter: PassageFilterQuery): boolean =>
  filter.unattemptedOnly || filter.difficulty.length > 0 || filter.tag.length > 0

/**
 * 画面の URL のクエリを絞り込みの条件にする。
 * 検証に失敗したら絞り込みなしにする（URL を手で壊しても 400 の画面にしない）
 */
export const parsePassageSearchParams = (
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams,
): PassageFilterQuery => {
  const entries = searchParams instanceof URLSearchParams
    ? Object.fromEntries(searchParams)
    : Object.fromEntries(
      Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    )
  const parsed = getPassageListQueryStringSchema.safeParse(entries)
  if (!parsed.success) return EMPTY_PASSAGE_FILTER
  return {
    difficulty: parsed.data.difficulty,
    tag: parsed.data.tag,
    unattemptedOnly: parsed.data.unattempted_only,
  }
}

/**
 * 絞り込みの条件を API と同じ名前のクエリ（tag / difficulty / unattempted_only / cursor）にする。
 * 空の条件は付けない。複数選択は並べ替えて、同じ条件が同じ文字列になるようにする
 */
export const buildPassageSearchParams = (query: PassageListQuery): URLSearchParams => {
  const params = new URLSearchParams()
  if (query.tag.length > 0) params.set("tag", [...query.tag].sort().join(","))
  if (query.difficulty.length > 0) params.set("difficulty", [...query.difficulty].sort().join(","))
  if (query.unattemptedOnly) params.set("unattempted_only", "true")
  if (query.cursor) params.set("cursor", query.cursor)
  return params
}

/**
 * 絞り込みの条件を付けた問題一覧の URL
 */
export const buildPassageListPath = (filter: PassageFilterQuery): string => {
  const search = buildPassageSearchParams(filter).toString()
  return search ? `/passages?${search}` : "/passages"
}

/**
 * 絞り込みの条件を付けた「ランダムに 1 問」の URL。未挑戦のみは使わない（API が未挑戦から優先して選ぶ）
 */
export const buildRandomPassagePath = (filter: PassageFilterQuery): string => {
  const search = buildPassageSearchParams({ ...filter, unattemptedOnly: false }).toString()
  return search ? `/passages/random?${search}` : "/passages/random"
}
