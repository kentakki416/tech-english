import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

import { GitHubContentClient } from "../client/github"
import {
  COLLECTOR_USER_AGENT,
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
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import * as service from "../service"

/**
 * collect:passages
 *
 * 有効なソースから英文を取得し、本文候補（passages, status = collected）を作る。本番は EventBridge Scheduler →
 * ECS RunTask で 1 日 1 回 `node dist/task/collect-passages.js` を起動する想定。
 *
 *   pnpm collect:passages                          # 有効な全ソース
 *   pnpm collect:passages --source-id=3            # 1 ソースだけ
 *   pnpm collect:passages --source-id=3 --dry-run  # 最大 5 件を取得して抽出結果を表示する（DB に書かない）
 *
 * task 自身は env を読んで DB client / Repository / GitHub client を組み立てて service に DI するだけ。
 * 1 ソースでも失敗があれば最後に throw して exit code 1 で終え、スケジューラに通知する。
 */
const main = async (): Promise<void> => {
  const args = parseCollectArgs(process.argv.slice(2))
  if (!env.GITHUB_CONTENT_TOKEN) {
    logger.warn("GITHUB_CONTENT_TOKEN is not set; GitHub API is used without authentication (60 req/h)")
  }

  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const { isShuttingDown } = setupGracefulShutdown(db)

  const repo = {
    contentSourceRepository: new DrizzleContentSourceRepository(db),
    passageRepository: new DrizzlePassageRepository(db),
    sourceDocumentRepository: new DrizzleSourceDocumentRepository(db),
  }
  const deps = {
    githubContentClient: new GitHubContentClient({ token: env.GITHUB_CONTENT_TOKEN, userAgent: COLLECTOR_USER_AGENT }),
    isShuttingDown,
  }

  try {
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
        sourceId: args.sourceId,
      },
      repo,
      deps,
    )
    logger.info("collect-passages completed", {
      createdPassageCount: result.createdPassageCount,
      failedSourceIds: result.failedSourceIds,
    })
    /**
     * 1 件でも失敗があれば exit 1 でスケジューラに通知する（他のソースは処理済み）
     */
    if (result.failedSourceIds.length > 0) {
      throw new Error(`collect-passages failed for sources: ${result.failedSourceIds.join(", ")}`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  logger.error(
    "collect-passages failed",
    err instanceof Error ? err : new Error(String(err)),
  )
  process.exit(1)
})
