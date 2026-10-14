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
   * 新しく挑戦を始められるか（公開中の問題だけ true）。false のときは inProgressAttempt が必ずある
   */
  canStart: boolean
  /**
   * 期限内の挑戦中。無ければ null
   */
  inProgressAttempt: { expiresAt: Date; id: number; startedAt: Date } | null
  /**
   * timeLimitSeconds は公開中の問題なら問題の制限時間、公開中でない問題なら挑戦中の挑戦の開始時点の制限時間
   */
  passage: Pick<PassageOverview, "id" | "difficulty" | "timeLimitSeconds" | "title" | "wordCount">
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
 * 開始確認の概要。期限内の挑戦中があれば、その期限を付ける。
 * 公開中でない問題（非公開に戻された問題）は、そのユーザーの期限内の挑戦中があるときだけ再開用に返し（canStart: false）、
 * 無ければ 404（挑戦の開始 API は非公開に戻された問題の挑戦中を再開できるので、その入口を残す）
 */
export const getPassageOverview = async (
  input: { now: Date; passageId: number; userId: number },
  repo: PassageRepo,
): Promise<Result<PassageOverviewView>> => {
  const [summary, attempt] = await Promise.all([
    repo.passageRepository.findPublishedById(input.passageId),
    repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, calculateAliveSince(input.now)),
  ])
  const inProgressAttempt = attempt
    ? { expiresAt: calculateExpiresAt(attempt.startedAt), id: attempt.id, startedAt: attempt.startedAt }
    : null

  if (summary) {
    return ok({
      attribution: buildAttribution(summary.source, summary.passage),
      canStart: true,
      inProgressAttempt,
      passage: summary.passage,
      questionCount: summary.questionCount,
      serverNow: input.now,
    })
  }
  if (!attempt) {
    logger.debug("PassageService: Passage is not published and has no in-progress attempt", { passageId: input.passageId, userId: input.userId })
    return err(notFoundError("Passage not found"))
  }

  /**
   * passages は物理削除しない（reading_attempts の外部キーは restrict）ので、挑戦があれば問題もある
   */
  const content = await repo.passageRepository.findAttemptContentById(input.passageId)
  if (!content) throw new Error(`Passage of attempt not found: attemptId=${attempt.id}, passageId=${input.passageId}`)
  const { passage } = content
  /**
   * 挑戦がある問題は一度公開されているので難易度を必ず持つ（公開の条件。非公開に戻しても消えない）
   */
  if (passage.difficulty === null) throw new Error(`Passage with an attempt has no difficulty: id=${passage.id}`)
  logger.debug("PassageService: Overview of unpublished passage for resuming", { attemptId: attempt.id, passageId: passage.id })
  return ok({
    attribution: buildAttribution(content.source, passage),
    canStart: false,
    inProgressAttempt,
    passage: {
      id: passage.id,
      difficulty: passage.difficulty,
      /**
       * 非公開の間に問題の制限時間が直されていることがあるので、解答画面と同じ挑戦の開始時点の制限時間を出す
       */
      timeLimitSeconds: attempt.timeLimitSeconds,
      title: passage.title,
      wordCount: passage.wordCount,
    },
    questionCount: content.questions.length,
    serverNow: input.now,
  })
}
