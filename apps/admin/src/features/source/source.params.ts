import "server-only"

import { type GetSourceResponse, sourceFetchTypeSchema } from "@repo/api-schema"

import { isLocalEnvironment } from "@/libs/environment"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * ソース一覧の `?fetch_type=`。不正・未指定と、ローカル以外のサイト（サイトのソースはローカルだけ）は GitHub
 */
export const parseSourceListFetchType = (value: string | string[] | undefined): SourceFetchType => {
  const parsed = sourceFetchTypeSchema.safeParse(value)
  if (!parsed.success) return "github_repository"
  return parsed.data === "website" && !isLocalEnvironment ? "github_repository" : parsed.data
}
