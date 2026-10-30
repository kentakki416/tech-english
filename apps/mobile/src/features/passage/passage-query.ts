import type { GetPassageListQueryString } from "@repo/api-schema"

import { buildQueryString } from "@/libs/query-string"

/**
 * 絞り込みの条件（問題一覧の API・ランダムに 1 問で共通）
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
 * 絞り込みの条件を API と同じ名前のクエリ（tag / difficulty / unattempted_only / cursor）の文字列にする。
 * 空の条件は付けない。複数選択はカンマ区切りで、並べ替えて同じ条件が同じ文字列になるようにする
 */
export const buildPassageSearchParams = (query: PassageListQuery): string => {
  const params: Record<string, string> = {}
  if (query.tag.length > 0) params.tag = [...query.tag].sort().join(",")
  if (query.difficulty.length > 0) params.difficulty = [...query.difficulty].sort().join(",")
  if (query.unattemptedOnly) params.unattempted_only = "true"
  if (query.cursor) params.cursor = query.cursor
  return buildQueryString(params)
}
