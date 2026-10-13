import { badRequestError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { calculateAliveSince, calculateExpiresAt } from "../lib/attempt-expiry"
import { buildAttribution, type PassageAttribution } from "../lib/build-attribution"
import { decodePassageCursor, encodePassageCursor } from "../lib/passage-cursor"
import type {
  PassageAttemptSummary,
  PassageOverview,
  PassageRepository,
  PublishedPassageFilter,
  PublishedPassageSummary,
  ReadingAttemptRepository,
} from "../repository"

type PassageRepo = { passageRepository: PassageRepository; readingAttemptRepository: ReadingAttemptRepository }

/**
 * ユーザーが指定する絞り込み（未挑戦の絞り込みは service が userId から作る）
 */
export type PassageFilterInput = Omit<PublishedPassageFilter, "unattemptedByUserId">

/**
 * 自分の挑戦状況
 */
export type PassageMyStatus = Omit<PassageAttemptSummary, "passageId">

/**
 * 問題一覧の 1 件
 */
export type PassageListItem = PublishedPassageSummary & { myStatus: PassageMyStatus }

/**
 * 問題一覧の結果。tags は公開中の問題があるソースのタグ全件、totalCount は絞り込み後の件数（cursor は無視）
 */
export type PassageListView = {
  items: PassageListItem[]
  nextCursor: string | null
  tags: string[]
  totalCount: number
}

/**
 * 開始確認の概要（本文は含まない）
 */
export type PassageOverviewView = {
  attribution: PassageAttribution
  /**
   * 期限内の挑戦中。無ければ null
   */
  inProgressAttempt: { expiresAt: Date; id: number; startedAt: Date } | null
  passage: PassageOverview
  questionCount: number
  serverNow: Date
}

/**
 * 挑戦の集計が無い問題の挑戦状況（未挑戦）
 */
const UNATTEMPTED_STATUS: PassageMyStatus = { attemptCount: 0, bestCorrectCount: null, inProgressAttemptId: null }

/**
 * 公開中の問題の一覧（絞り込み、cursor ページング）と自分の挑戦状況。並びは公開日時の新しい順
 */
export const getPassageList = async (
  input: {
    cursor: string | undefined
    filter: PassageFilterInput
    limit: number
    now: Date
    unattemptedOnly: boolean
    userId: number
  },
  repo: PassageRepo,
): Promise<Result<PassageListView>> => {
  const cursor = input.cursor === undefined ? null : decodePassageCursor(input.cursor)
  if (input.cursor !== undefined && !cursor) return err(badRequestError("Invalid cursor"))

  const filter: PublishedPassageFilter = { ...input.filter, unattemptedByUserId: input.unattemptedOnly ? input.userId : null }
  const [rows, totalCount, tags] = await Promise.all([
    repo.passageRepository.findPublishedPage(filter, { cursor, limit: input.limit + 1 }),
    repo.passageRepository.countPublished(filter),
    repo.passageRepository.findPublishedTags(),
  ])
  /**
   * limit + 1 件を頼み、余った 1 件があれば次のページがある
   */
  const summaries = rows.slice(0, input.limit)
  const last = summaries[summaries.length - 1]
  const nextCursor = rows.length > input.limit && last
    ? encodePassageCursor({ id: last.passage.id, publishedAt: last.passage.publishedAt })
    : null

  const attemptSummaries = await repo.readingAttemptRepository.summarizeByPassageIds(
    input.userId,
    summaries.map((summary) => summary.passage.id),
    calculateAliveSince(input.now),
  )
  const statusByPassageId = new Map(
    attemptSummaries.map(({ passageId, ...myStatus }) => [passageId, myStatus]),
  )
  const items = summaries.map((summary) => ({
    ...summary,
    myStatus: statusByPassageId.get(summary.passage.id) ?? UNATTEMPTED_STATUS,
  }))
  return ok({ items, nextCursor, tags, totalCount })
}

/**
 * 絞り込みに合う問題からランダムに 1 つ選ぶ。未挑戦（提出済みが 0 件）から選び、無ければ挑戦済みも含めて選ぶ
 */
export const getRandomPassageId = async (
  input: { filter: PassageFilterInput; userId: number },
  repo: PassageRepo,
): Promise<Result<{ id: number }>> => {
  const unattemptedId = await repo.passageRepository.findRandomPublishedId({ ...input.filter, unattemptedByUserId: input.userId })
  if (unattemptedId !== null) return ok({ id: unattemptedId })

  const anyId = await repo.passageRepository.findRandomPublishedId({ ...input.filter, unattemptedByUserId: null })
  if (anyId === null) {
    logger.debug("PassageService: No published passage matches the filter", { filter: input.filter })
    return err(notFoundError("No passage matches the filter"))
  }
  return ok({ id: anyId })
}

/**
 * 開始確認の概要（公開中の問題だけ）。期限内の挑戦中があれば、その期限を付ける
 */
export const getPassageOverview = async (
  input: { now: Date; passageId: number; userId: number },
  repo: PassageRepo,
): Promise<Result<PassageOverviewView>> => {
  const summary = await repo.passageRepository.findPublishedById(input.passageId)
  if (!summary) {
    logger.debug("PassageService: Published passage not found", { passageId: input.passageId })
    return err(notFoundError("Passage not found"))
  }

  const attempt = await repo.readingAttemptRepository.findAliveInProgress(
    input.userId,
    input.passageId,
    calculateAliveSince(input.now),
  )
  return ok({
    attribution: buildAttribution(summary.source, summary.passage),
    inProgressAttempt: attempt
      ? { expiresAt: calculateExpiresAt(attempt.startedAt), id: attempt.id, startedAt: attempt.startedAt }
      : null,
    passage: summary.passage,
    questionCount: summary.questionCount,
    serverNow: input.now,
  })
}
