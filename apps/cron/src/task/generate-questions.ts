import { createDrizzleClient } from "@repo/db"
import { logger } from "@repo/logger"

import { createAnthropicClient } from "../client/anthropic"
import { env } from "../env"
import { parseGenerateQuestionsArgs } from "../lib/question-generation"
import { DrizzlePassageRepository } from "../repository/drizzle"
import { setupGracefulShutdown } from "../runtime/graceful-shutdown"
import * as service from "../service"

/**
 * generate:questions
 *
 * collected の本文候補から、Claude API で設問・和訳・用語集を生成して draft にする。本番は EventBridge Scheduler →
 * ECS RunTask で 1 日 1 回（collect:passages の 1 時間後）`node dist/task/generate-questions.js` を起動する想定。
 *
 *   pnpm generate:questions                  # collected を古い順に最大 GENERATE_MAX_PASSAGES_PER_RUN 件
 *   pnpm generate:questions --passage-id=42  # 1 件だけ（下書きの上限を見ない）
 *
 * task 自身は env を読んで DB client / Repository / LLM のクライアントを組み立てて service に DI するだけ。
 * 1 件でも failed（失敗が上限に達した）があれば最後に throw して exit code 1 で終え、スケジューラに通知する。
 */
const main = async (): Promise<void> => {
  const args = parseGenerateQuestionsArgs(process.argv.slice(2))
  /**
   * 他のタスクでは不要なので env のスキーマでは任意にしてあり、ここで必須にする（DB に接続する前に止める）
   */
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. generate:questions calls the Claude API; set it in apps/cron/.env.local " +
        "(pnpm exec dotenvx set ANTHROPIC_API_KEY \"<key>\" -f .env.local) or in the task's secrets",
    )
  }

  const db = createDrizzleClient({
    onError: (error) => {
      logger.error("db idle client error", error)
    },
    url: env.DATABASE_URL,
  })
  const { isShuttingDown } = setupGracefulShutdown(db)

  logger.info("generate-questions started", {
    generationModel: env.GENERATION_MODEL,
    maxPassagesPerRun: env.GENERATE_MAX_PASSAGES_PER_RUN,
    maxPendingDrafts: env.GENERATE_MAX_PENDING_DRAFTS,
    passageId: args.passageId,
    verificationModel: env.VERIFICATION_MODEL,
  })

  try {
    const result = await service.passage.generateQuestions(
      {
        generationModel: env.GENERATION_MODEL,
        isShuttingDown,
        maxPassagesPerRun: env.GENERATE_MAX_PASSAGES_PER_RUN,
        maxPendingDrafts: env.GENERATE_MAX_PENDING_DRAFTS,
        now: () => new Date(),
        passageId: args.passageId,
        random: Math.random,
        verificationModel: env.VERIFICATION_MODEL,
      },
      { passageRepository: new DrizzlePassageRepository(db) },
      { llmClient: createAnthropicClient({ apiKey }) },
    )
    logger.info("generate-questions completed", result)
    /**
     * failed になった本文候補があれば exit 1 でスケジューラに通知する（他の件は処理済み）
     */
    if (result.failedCount > 0) {
      throw new Error(`generate-questions: ${result.failedCount} passage(s) reached the attempt limit and were marked as failed`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  logger.error(
    "generate-questions failed",
    err instanceof Error ? err : new Error(String(err)),
  )
  process.exit(1)
})
