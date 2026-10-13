import type { ContentSource } from "@repo/domain"
import { logger } from "@repo/logger"

import { GitHubRateLimitError } from "../../client/github"

import { collectGitHubSource } from "./collect-github-source"
import { collectWebsiteSource } from "./collect-website-source"
import type { CollectionDeps, CollectionRepo, SourceCollectionResult } from "./types"

export type CollectPassagesInput = {
  /**
   * GitHub の rate limit の残りがこれを切ったら、そのソースを打ち切る
   */
  githubMinRateLimitRemaining: number
  maxDocumentsPerSource: number
  maxPassagesPerRun: number
  now: Date
  /**
   * サイトのページを取り直す間隔（日）
   */
  refetchDays: number
  /**
   * null は有効な全ソース
   */
  sourceId: number | null
}

export type CollectPassagesResult = {
  createdPassageCount: number
  /**
   * 例外で失敗したソース。1 件でもあれば task が exit 1 で終える
   */
  failedSourceIds: number[]
  results: (SourceCollectionResult & { sourceId: number })[]
}

/**
 * --source-id の指定があればそのソースだけ（無い・無効なら throw）、無ければ有効な全ソースを古い順に
 */
const findTargetSources = async (sourceId: number | null, repo: CollectionRepo): Promise<ContentSource[]> => {
  if (sourceId === null) return repo.contentSourceRepository.findEnabled()
  const source = await repo.contentSourceRepository.findById(sourceId)
  if (!source) throw new Error(`Content source not found: id=${sourceId}`)
  if (!source.isEnabled) {
    throw new Error(`Content source is disabled: id=${sourceId} (disabled sources can only be previewed with --dry-run)`)
  }
  return [source]
}

/**
 * ソースを順に収集する。
 *
 * - 本文候補の上限（maxPassagesPerRun）の残りを各ソースに渡し、残りが無くなったら以降のソースは処理しない（失敗ではない）
 * - 1 ソースの失敗はログに出して failedSourceIds に入れ、次のソースへ進む
 * - GitHub の rate limit（例外・rate_limited のどちらも）は失敗にせず、以降の GitHub のソースを飛ばす（rate limit は token 単位のため）。
 *   サイトのソースには影響させない
 * - サイトの 429 / 503（throttled）は失敗にしない
 */
export const collectPassages = async (
  input: CollectPassagesInput,
  repo: CollectionRepo,
  deps: CollectionDeps,
): Promise<CollectPassagesResult> => {
  const sources = await findTargetSources(input.sourceId, repo)
  const failedSourceIds: number[] = []
  const results: CollectPassagesResult["results"] = []
  let createdPassageCount = 0
  let isGitHubRateLimited = false

  for (const source of sources) {
    if (deps.isShuttingDown()) break
    const remainingPassages = input.maxPassagesPerRun - createdPassageCount
    if (remainingPassages <= 0) {
      logger.info("passage limit per run reached; remaining sources are skipped", { sourceId: source.id })
      break
    }
    if (source.fetchType === "github_repository" && isGitHubRateLimited) {
      logger.warn("GitHub rate limit is low; skipped", { sourceId: source.id })
      continue
    }

    try {
      const result = source.fetchType === "website"
        ? await collectWebsiteSource(
          {
            maxDocuments: input.maxDocumentsPerSource,
            maxPassages: remainingPassages,
            now: input.now,
            refetchDays: input.refetchDays,
            source,
          },
          repo,
          deps,
        )
        : await collectGitHubSource(
          {
            maxDocuments: input.maxDocumentsPerSource,
            maxPassages: remainingPassages,
            minRateLimitRemaining: input.githubMinRateLimitRemaining,
            now: input.now,
            source,
          },
          repo,
          deps,
        )
      logger.info("source collected", { ...result, sourceId: source.id })
      results.push({ ...result, sourceId: source.id })
      createdPassageCount += result.createdPassageCount
      if (result.status === "rate_limited") isGitHubRateLimited = true
    } catch (error) {
      if (error instanceof GitHubRateLimitError) {
        logger.warn("GitHub rate limit exceeded; remaining GitHub sources are skipped", { sourceId: source.id })
        isGitHubRateLimited = true
        continue
      }
      logger.error(
        "source collection failed",
        error instanceof Error ? error : new Error(String(error)),
        { sourceId: source.id },
      )
      failedSourceIds.push(source.id)
    }
  }

  return { createdPassageCount, failedSourceIds, results }
}
