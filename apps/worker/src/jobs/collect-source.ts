import { logger } from "@repo/logger"
import type { CollectSourceJobData, JobProcessor } from "@repo/queue"

import { GitHubNotFoundError, GitHubRateLimitError } from "../client/github"
import { selectGitHubMinRateLimitRemaining } from "../const/collection"
import type { SourceCollectionOutcome, SourceCollectionRunClaim, SourceCollectionRunRepository } from "../repository"
import type { CollectionRuntime } from "../runtime/collection"
/**
 * service/collection の index は @repo/content-extractor（jsdom）まで読むので、例外のクラスはファイルを直接読む
 */
import { SourceNotCollectableError } from "../service/collection/errors"

/**
 * 収集できないソースの理由ごとの、記録の失敗の理由（admin にそのまま出す）
 */
const NOT_COLLECTABLE_ERRORS = {
  disabled: "ソースが無効になっていた",
  not_found: "ソースが無かった",
  website: "サイトのソースは収集しない",
} satisfies Record<SourceNotCollectableError["reason"], string>

export type CollectSourceDeps = {
  githubToken: string | undefined
  limits: { maxDocuments: number; maxPassages: number }
  loadCollectionRuntime: () => Promise<CollectionRuntime>
  now: () => Date
  sourceCollectionRunRepository: SourceCollectionRunRepository
}

/**
 * 収集の例外を記録の結果にする。rate limit は打ち切りとして扱い、ほかは失敗にする
 */
const convertCollectionErrorToOutcome = (error: unknown, claim: SourceCollectionRunClaim): SourceCollectionOutcome => {
  if (error instanceof GitHubRateLimitError) return { createdPassageCount: 0, fetchedDocumentCount: 0, status: "rate_limited" }
  if (error instanceof SourceNotCollectableError) return { error: NOT_COLLECTABLE_ERRORS[error.reason], status: "failed" }
  if (error instanceof GitHubNotFoundError) {
    return { error: `GitHub に見つからない（リポジトリ・ブランチ・ファイルが無いか、非公開）: ${error.path}`, status: "failed" }
  }
  const message = error instanceof Error ? error.message : String(error)
  logger.error("collectSource: collection failed", error instanceof Error ? error : new Error(message), {
    runId: claim.runId,
    sourceId: claim.sourceId,
  })
  return { error: `収集に失敗した: ${message}`, status: "failed" }
}

/**
 * 収集の失敗は例外にせず結果にする（記録に書いてジョブを正常に終え、BullMQ のリトライに回さない。リトライしても同じ失敗を繰り返すだけのため）
 */
const runCollection = async (claim: SourceCollectionRunClaim, deps: CollectSourceDeps): Promise<SourceCollectionOutcome> => {
  try {
    const runtime = await deps.loadCollectionRuntime()
    return await runtime.collectSourceById({
      githubMinRateLimitRemaining: selectGitHubMinRateLimitRemaining(deps.githubToken),
      maxDocuments: deps.limits.maxDocuments,
      maxPassages: deps.limits.maxPassages,
      now: deps.now(),
      sourceId: claim.sourceId,
    })
  } catch (error) {
    return convertCollectionErrorToOutcome(error, claim)
  }
}

/**
 * `collect-source` ジョブハンドラ（admin の今すぐ収集）。
 *
 * api が作った収集の記録を running にし、1 ソースを収集して、結果を記録に書く。
 * 記録の読み書き（claim / finish）の失敗だけが throw され、BullMQ のリトライになる。
 *
 * 冪等性: 同じジョブが 2 回動いても、収集は冪等（本文候補は content_hash の unique、commit SHA の記録は楽観ロック）。
 * 結果は claim の時刻をトークンにして書くので、古い実行が新しい結果を上書きしない
 */
export const collectSource = (deps: CollectSourceDeps): JobProcessor<CollectSourceJobData> =>
  async (message) => {
    const claim = await deps.sourceCollectionRunRepository.claim(message.data.runId, deps.now())
    if (!claim) {
      logger.warn("collectSource: run is not claimable", { jobId: message.id, runId: message.data.runId })
      return
    }

    const outcome = await runCollection(claim, deps)
    const isWritten = await deps.sourceCollectionRunRepository.finish(claim, outcome, deps.now())
    if (!isWritten) {
      logger.warn("collectSource: run was taken over; the result is not written", { runId: claim.runId })
      return
    }
    logger.info("collectSource: finished", { ...outcome, runId: claim.runId, sourceId: claim.sourceId })
  }
