import { type FetchPageResult, type IWebPageClient , isTargetPath ,
  buildPageUrl,
  extractWebPage,
  findStartPagePath,
  selectFetchablePagePaths,
} from "@repo/content-extractor"
import type { GitHubRepositorySource, WebsiteSource } from "@repo/domain"
import { logger } from "@repo/logger"

import type { DocumentPreview, SourcePreview } from "../../lib/format-dry-run"

import { extractGitHubFile } from "./extract-github-file"
import { listGitHubTargetFiles } from "./list-github-target-files"
import type { CollectionDeps, CollectionRepo } from "./types"

type PreviewInput = {
  maxDocuments: number
  sourceId: number
}

/**
 * コミットの SHA の表示に使う先頭の文字数
 */
const SHORT_COMMIT_SHA_LENGTH = 7

/**
 * 試し実行では条件付きリクエストにしない（前回の取得に関係なく本文を取る）
 */
const UNCONDITIONAL = { etag: null, lastModified: null }

const formatErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * GitHub は blob SHA に関係なく最新コミットの対象ファイルの先頭から取る
 */
const previewGitHubSource = async (
  input: PreviewInput,
  source: GitHubRepositorySource,
  deps: CollectionDeps,
): Promise<SourcePreview> => {
  const commitSha = await deps.githubContentClient.getLatestCommitSha(source.repository, source.branch)
  const { files, isComplete } = await listGitHubTargetFiles({ commitSha, source }, deps)
  const documents: DocumentPreview[] = []
  for (const file of files.slice(0, input.maxDocuments)) {
    const content = await deps.githubContentClient.getFileContent(source.repository, file.path, commitSha)
    try {
      documents.push({ document: extractGitHubFile(file.path, content), path: file.path, status: "extracted" })
    } catch (error) {
      documents.push({ errorMessage: formatErrorMessage(error), path: file.path, status: "failed" })
    }
  }

  return {
    documents,
    fetchedFrom: `${source.repository} @ ${commitSha.slice(0, SHORT_COMMIT_SHA_LENGTH)}`,
    isComplete,
    sourceId: source.id,
    sourceName: source.name,
    targetDocumentCount: files.length,
  }
}

/**
 * サイトのページを取得した結果を試し実行の 1 件にする。200 なら本文を抽出する（不正な CSS セレクタは failed）
 */
const buildPagePreview = (source: WebsiteSource, path: string, result: FetchPageResult): DocumentPreview => {
  switch (result.kind) {
  case "ok":
    try {
      return {
        document: extractWebPage(source, { body: result.body, finalUrl: result.finalUrl, path }),
        path,
        status: "extracted",
      }
    } catch (error) {
      return { errorMessage: formatErrorMessage(error), path, status: "failed" }
    }
  case "not_modified":
  case "http_error":
    return { path, reason: `HTTP ${result.status}`, status: "not_fetched" }
  case "network_error":
    return { path, reason: `ネットワークエラー（${result.errorMessage}）`, status: "not_fetched" }
  case "skipped":
    return {
      path,
      reason: result.status === null ? result.reason : `${result.reason}（HTTP ${result.status}）`,
      status: "not_fetched",
    }
  }
}

/**
 * sitemap の取得してよい URL の先頭 maxDocuments 件を取得する
 */
const previewWebsiteFromSitemap = async (
  input: PreviewInput,
  source: WebsiteSource & { sitemapUrl: string },
  client: IWebPageClient,
): Promise<SourcePreview> => {
  const sitemapUrls = await client.fetchSitemapUrls(source.sitemapUrl)
  const paths = selectFetchablePagePaths(sitemapUrls.map(({ url }) => url), source.sitemapUrl, source, client)
  const documents: DocumentPreview[] = []
  for (const path of paths.slice(0, input.maxDocuments)) {
    documents.push(buildPagePreview(source, path, await client.fetchPage(buildPageUrl(source, path), UNCONDITIONAL)))
  }
  return {
    documents,
    fetchedFrom: `${source.siteUrl}（sitemap: ${source.sitemapUrl}）`,
    isComplete: true,
    sourceId: source.id,
    sourceName: source.name,
    targetDocumentCount: paths.length,
  }
}

/**
 * 開始ページからリンクを幅優先でたどり、対象パスのページを取得する。取得するページは開始ページを含めて maxDocuments 件まで。
 * たどるのは対象パスのページだけ（収集でも、対象パス外で取得するのは開始ページだけのため）
 */
const previewWebsiteFromStartPage = async (
  input: PreviewInput,
  source: WebsiteSource,
  client: IWebPageClient,
): Promise<SourcePreview> => {
  const startPath = findStartPagePath(source)
  if (startPath === null) throw new Error(`Website source has neither sitemap_url nor start_url: id=${source.id}`)
  const queue = [startPath]
  const seenPaths = new Set(queue)
  const documents: DocumentPreview[] = []
  let fetchedPageCount = 0
  while (fetchedPageCount < input.maxDocuments) {
    const path = queue.shift()
    if (path === undefined) break
    const result = await client.fetchPage(buildPageUrl(source, path), UNCONDITIONAL)
    fetchedPageCount += 1
    const preview = buildPagePreview(source, path, result)
    if (preview.status === "extracted" && result.kind === "ok") {
      for (const linkPath of selectFetchablePagePaths(preview.document.links, result.finalUrl, source, client)) {
        if (seenPaths.has(linkPath)) continue
        seenPaths.add(linkPath)
        queue.push(linkPath)
      }
    }
    if (isTargetPath(path, source)) {
      documents.push(preview)
    } else if (preview.status !== "extracted") {
      logger.warn("failed to read the start page", { path, sourceId: source.id })
    }
  }
  return {
    documents,
    fetchedFrom: `${source.siteUrl}（開始ページ ${source.startUrl} からリンクをたどる）`,
    isComplete: true,
    sourceId: source.id,
    sourceName: source.name,
    targetDocumentCount: [...seenPaths].filter((path) => isTargetPath(path, source)).length,
  }
}

/**
 * サイトは DB に書かずに、sitemap があればその先頭から、無ければ開始ページからリンクをたどって取得する
 */
const previewWebsiteSource = async (
  input: PreviewInput,
  source: WebsiteSource,
  deps: CollectionDeps,
): Promise<SourcePreview> => {
  const client = deps.createWebPageClient(source.siteUrl)
  await client.loadRobots()
  const { sitemapUrl } = source
  return sitemapUrl === null
    ? previewWebsiteFromStartPage(input, source, client)
    : previewWebsiteFromSitemap(input, { ...source, sitemapUrl }, client)
}

/**
 * 試し実行（--dry-run）。ソースの文書を最大 maxDocuments 件取得し、抽出と切り分けの結果を返す。
 *
 * 無効のソースも対象にする（登録直後に本文が取れるかを確かめてから有効にするため）。Repository の書き込みメソッドは呼ばない
 */
export const previewSource = async (
  input: PreviewInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<SourcePreview> => {
  const source = await repo.contentSourceRepository.findById(input.sourceId)
  if (!source) throw new Error(`Content source not found: id=${input.sourceId}`)
  return source.fetchType === "website"
    ? previewWebsiteSource(input, source, deps)
    : previewGitHubSource(input, source, deps)
}
