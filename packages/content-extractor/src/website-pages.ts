import type { WebsiteSource } from "@repo/domain"

import { extractDocument, type ExtractedDocument } from "./document"
import { isTargetPath } from "./path-filter"
import { isFetchablePath } from "./url"

/**
 * 取得したページ（リダイレクトの行き先）が本文候補を作ってよい URL か。行き先の pathname でも拡張子と対象パス・除外パスを確かめる
 * （除外パスへリダイレクトされたページの本文を、元のパスの出典で保存しないため）
 */
export const isPassageTargetUrl = (url: string, source: WebsiteSource): boolean => {
  const { pathname } = new URL(url)
  return isFetchablePath(pathname) && isTargetPath(pathname, source)
}

/**
 * 取得したページの本文を抽出して本文候補に切り分ける。タイトルが無ければ path にする。不正な CSS セレクタは throw する
 */
export const extractWebPage = (
  source: WebsiteSource,
  page: { body: string; finalUrl: string; path: string },
): ExtractedDocument =>
  extractDocument({
    content: page.body,
    contentSelector: source.contentSelector,
    excludeSelectors: source.excludeSelectors,
    fallbackTitle: page.path,
    format: "html",
    url: page.finalUrl,
  })
