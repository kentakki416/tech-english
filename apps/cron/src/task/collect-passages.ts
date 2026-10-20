import { COLLECTOR_USER_AGENT, WebPageClient } from "@repo/content-extractor"
import { logger } from "@repo/logger"

import { GitHubContentClient } from "../client/github"
import {
  DRY_RUN_MAX_DOCUMENTS,
  GITHUB_MIN_RATE_LIMIT_REMAINING,
  GITHUB_UNAUTHENTICATED_MIN_RATE_LIMIT_REMAINING,
} from "../const/collection"
import { env } from "../env"
import { formatDryRun } from "../lib/format-dry-run"
import { parseCollectArgs } from "../lib/parse-collect-args"
import {
  DrizzleContentSourceRepository,
  DrizzlePassageRepository,
  DrizzleSourceDocumentRepository,
} from "../repository/drizzle"
import { runTask } from "../run-task"
import * as service from "../service"

/**
 *
 * admin側で登録した有効なソースから英文を抽出し、問題にできる条件を満たす本文候補（passages, status = collected）を作成する。
 *
 *   pnpm collect:passages                          # 有効な全ソース
 *   pnpm collect:passages --source-id=3            # 1 ソースだけ
 *   pnpm collect:passages --source-id=3 --dry-run  # 最大 5 件を取得して抽出結果を表示する（DB に書かない）
 *
 */
runTask("collect-passages", async ({ db }) => {
  const args = parseCollectArgs(process.argv.slice(2))
  if (!env.GITHUB_CONTENT_TOKEN) {
    logger.warn("GITHUB_CONTENT_TOKEN is not set; GitHub API is used without authentication (60 req/h)")
  }

  const repo = {
    contentSourceRepository: new DrizzleContentSourceRepository(db),
    passageRepository: new DrizzlePassageRepository(db),
    sourceDocumentRepository: new DrizzleSourceDocumentRepository(db),
  }
  const userAgent = env.COLLECT_WEB_CONTACT_URL
    ? `${COLLECTOR_USER_AGENT} (+${env.COLLECT_WEB_CONTACT_URL})`
    : COLLECTOR_USER_AGENT
  const deps = {
    createWebPageClient: (origin: string) => new WebPageClient({
      allowedOrigin: origin,
      requestIntervalMs: env.COLLECT_WEB_REQUEST_INTERVAL_MS,
      userAgent,
    }),
    githubContentClient: new GitHubContentClient({ token: env.GITHUB_CONTENT_TOKEN, userAgent }),
  }

  if (args.dryRun && args.sourceId !== null) {
    const preview = await service.collection.previewSource(
      { maxDocuments: DRY_RUN_MAX_DOCUMENTS, sourceId: args.sourceId },
      repo,
      deps,
    )
    process.stdout.write(formatDryRun(preview))
    return
  }

  logger.info("collect-passages started", {
    maxDocumentsPerSource: env.COLLECT_MAX_DOCUMENTS_PER_SOURCE,
    maxPassagesPerRun: env.COLLECT_MAX_PASSAGES_PER_RUN,
    refetchDays: env.COLLECT_WEB_REFETCH_DAYS,
    sourceId: args.sourceId,
  })
  const result = await service.collection.collectPassages(
    {
      githubMinRateLimitRemaining: env.GITHUB_CONTENT_TOKEN
        ? GITHUB_MIN_RATE_LIMIT_REMAINING
        : GITHUB_UNAUTHENTICATED_MIN_RATE_LIMIT_REMAINING,
      maxDocumentsPerSource: env.COLLECT_MAX_DOCUMENTS_PER_SOURCE,
      maxPassagesPerRun: env.COLLECT_MAX_PASSAGES_PER_RUN,
      now: new Date(),
      refetchDays: env.COLLECT_WEB_REFETCH_DAYS,
      sourceId: args.sourceId,
    },
    repo,
    deps,
  )
  logger.info("collect-passages completed", {
    createdPassageCount: result.createdPassageCount,
    failedSourceIds: result.failedSourceIds,
  })
  if (result.failedSourceIds.length > 0) {
    throw new Error(`collect-passages failed for sources: ${result.failedSourceIds.join(", ")}`)
  }
})
