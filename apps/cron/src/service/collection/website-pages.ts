import type { WebsiteSource } from "@repo/domain"

import { BlockedUrlError, type IWebPageClient } from "../../client/web"
import { extractDocument, type ExtractedDocument } from "../../lib/document"
import { isTargetPath } from "../../lib/path-filter"
import { isFetchablePath, normalizePageUrl } from "../../lib/url"

/**
 * source_documents.path（URL の pathname）から取得する URL を作る。オリジンはソースで決まる
 */
export const buildPageUrl = (source: WebsiteSource, path: string): string => `${new URL(source.siteUrl).origin}${path}`

/**
 * 取得してよいページの URL なら pathname を返す（取得してよくなければ null）。
 * 正規化できる（https）、ソースと同じオリジン、ページの拡張子、対象パスに合う、robots.txt で許可されている、のすべてを満たすもの
 */
export const findFetchablePagePath = (
  rawUrl: string,
  base: string,
  source: WebsiteSource,
  client: Pick<IWebPageClient, "isAllowedByRobots">,
): string | null => {
  const normalized = normalizePageUrl(rawUrl, base)
  if (normalized === null) return null
  const url = new URL(normalized)
  if (url.origin !== new URL(source.siteUrl).origin) return null
  if (!isFetchablePath(url.pathname) || !isTargetPath(url.pathname, source)) return null
  return client.isAllowedByRobots(normalized) ? url.pathname : null
}

/**
 * URL の列から取得してよいページの pathname を、重複を除いて元の順番で返す
 */
export const selectFetchablePagePaths = (
  rawUrls: string[],
  base: string,
  source: WebsiteSource,
  client: Pick<IWebPageClient, "isAllowedByRobots">,
): string[] => {
  const paths = rawUrls.flatMap((rawUrl) => {
    const path = findFetchablePagePath(rawUrl, base, source, client)
    return path === null ? [] : [path]
  })
  return [...new Set(paths)]
}

/**
 * 開始ページの pathname。対象パスに合わなくてもリンクをたどるために取得する。
 * 開始ページが無ければ null、サイトの外を指していれば BlockedUrlError（登録の誤り）
 */
export const findStartPagePath = (source: WebsiteSource): string | null => {
  if (source.startUrl === null) return null
  const normalized = normalizePageUrl(source.startUrl, source.siteUrl)
  if (normalized === null || new URL(normalized).origin !== new URL(source.siteUrl).origin) {
    throw new BlockedUrlError(source.startUrl)
  }
  return new URL(normalized).pathname
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
