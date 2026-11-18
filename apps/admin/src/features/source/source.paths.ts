import type { GetSourceResponse } from "@repo/api-schema"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

export const SOURCE_LIST_PATHS: Record<SourceFetchType, string> = {
  github_repository: "/sources",
  website: "/sources?fetch_type=website",
}

export const SOURCE_CREATE_PATHS: Record<SourceFetchType, string> = {
  github_repository: "/sources/new/github",
  website: "/sources/new/website",
}
