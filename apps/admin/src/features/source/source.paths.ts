import type { GetSourceResponse } from "@repo/api-schema"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * 取得方法ごとのソース一覧（[GitHub] [サイト] のリンク先）
 */
export const SOURCE_LIST_PATHS: Record<SourceFetchType, string> = {
  github_repository: "/sources",
  website: "/sources?fetch_type=website",
}

/**
 * 取得方法ごとのソースの登録の画面
 */
export const SOURCE_CREATE_PATHS: Record<SourceFetchType, string> = {
  github_repository: "/sources/new/github",
  website: "/sources/new/website",
}
