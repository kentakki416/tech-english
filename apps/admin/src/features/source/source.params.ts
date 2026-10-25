import "server-only"

import { type GetSourceResponse, sourceFetchTypeSchema } from "@repo/api-schema"

import { isLocalEnvironment } from "@/libs/environment"
import { convertSearchParamBySchema, type SearchParamValue } from "@/libs/search-params"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * ソース一覧の `?fetch_type=`。不正・未指定と、ローカル以外のサイト（サイトのソースはローカルだけ）は GitHub
 */
export const parseSourceListFetchType = (value: SearchParamValue): SourceFetchType => {
  const fetchType = convertSearchParamBySchema(sourceFetchTypeSchema, value, "github_repository")
  return fetchType === "website" && !isLocalEnvironment ? "github_repository" : fetchType
}
