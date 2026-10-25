import { logger } from "@repo/logger"

import { createAnthropicClient } from "../client/anthropic"
import { env } from "../env"
import { describeRunFailure, parseGenerateQuestionsArgs } from "../lib/question-generation"
import { DrizzlePassageRepository } from "../repository/drizzle"
import { runTask } from "../run-task"
import * as service from "../service"

/**
 * generate:questions
 *
 * collected の本文候補から、Claude API で設問・和訳・用語集を生成して draft にする。本番は EventBridge Scheduler →
 * ECS RunTask で 1 日 1 回 `node dist/task/generate-questions.js` を起動する想定。
 *
 *   pnpm generate:questions                  # collected を古い順に最大 GENERATE_MAX_PASSAGES_PER_RUN 件
 *   pnpm generate:questions --passage-id=42  # 1 件だけ（下書きの上限を見ない）
 */
runTask("generate-questions", async ({ db }) => {
  const args = parseGenerateQuestionsArgs(process.argv.slice(2))
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. generate:questions calls the Claude API; set it in apps/cron/.env.local " +
        "(pnpm exec dotenvx set ANTHROPIC_API_KEY \"<key>\" -f .env.local) or in the task's secrets",
    )
  }

  logger.info("generate-questions started", {
    generationModel: env.GENERATION_MODEL,
    maxPassagesPerRun: env.GENERATE_MAX_PASSAGES_PER_RUN,
    maxPendingDrafts: env.GENERATE_MAX_PENDING_DRAFTS,
    passageId: args.passageId,
    verificationModel: env.VERIFICATION_MODEL,
  })

  const result = await service.passage.generateQuestions(
    {
      generationModel: env.GENERATION_MODEL,
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
  const failure = describeRunFailure(result)
  if (failure !== null) throw new Error(failure)
})
