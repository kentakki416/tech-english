import type { ZodType, ZodTypeDef } from "zod"

/**
 * URL のクエリの読み取り（Server Component の searchParams）。ダッシュボードとユーザー一覧で使う
 */

export type SearchParamValue = string | string[] | undefined

export type SearchParams = Record<string, SearchParamValue>

/**
 * 同じ名前のクエリが 2 つ以上あれば最初の値を使う
 */
const pickFirstSearchParam = (value: SearchParamValue): string | undefined => (Array.isArray(value) ? value[0] : value)

/**
 * URL の値を API のクエリのスキーマ（の 1 項目）で読む。未指定はスキーマの既定値、不正なら fallback
 */
export const convertSearchParamBySchema = <T>(schema: ZodType<T, ZodTypeDef, unknown>, value: SearchParamValue, fallback: T): T => {
  const parsed = schema.safeParse(pickFirstSearchParam(value))
  return parsed.success ? parsed.data : fallback
}

/**
 * 絞り込みの文字。前後の空白を除き、maxLength（API の上限）を超える分は切り詰める（API は超えると 400 を返すため）。空なら undefined
 */
export const convertSearchParamToKeyword = (value: SearchParamValue, maxLength: number | null): string | undefined => {
  const keyword = pickFirstSearchParam(value)?.trim()
  return keyword ? keyword.slice(0, maxLength ?? undefined) : undefined
}
