import {
  type GlossaryEntry,
  numberParagraphs,
  type Passage,
  type PassageBlockType,
  type PassageDifficulty,
  type Question,
  type ReadingAttempt,
} from "@repo/domain"
import { conflictError, err, notFoundError, ok, Result, unauthorizedError } from "@repo/errors"
import { logger } from "@repo/logger"

import { calculateAliveSince, calculateExpiresAt, isAttemptExpired } from "../lib/attempt-expiry"
import { buildAttribution, type PassageAttribution } from "../lib/build-attribution"
import { type PassageSegment, segmentPassage, type SegmentWithRange } from "../lib/segment-passage"
import type { AttemptContent, PassageRepository, ReadingAttemptRepository, UserRepository } from "../repository"

type AttemptRepo = {
  passageRepository: PassageRepository
  readingAttemptRepository: ReadingAttemptRepository
  userRepository: UserRepository
}

/**
 * 挑戦した問題の概要
 */
export type AttemptPassageView = Pick<Passage, "id" | "title" | "wordCount"> & { difficulty: PassageDifficulty }

/**
 * 本文の 1 ブロック。paragraphNumber は heading と code が null、segments は code のブロックが空
 */
export type AttemptBlockView = {
  lang: string | null
  paragraphNumber: number | null
  segments: PassageSegment[]
  text: string
  translationJa: string | null
  type: PassageBlockType
}

/**
 * 用語集の項目（位置はセグメントの glossaryEntryId で示すので持たない）
 */
export type AttemptGlossaryEntryView = Pick<GlossaryEntry, "id" | "lemma" | "meaningJa" | "noteJa" | "partOfSpeech" | "surface">

/**
 * 解答中の設問。正解・解説・根拠を持たない
 */
export type AttemptQuestionView = Pick<Question, "id" | "choices" | "orderIndex" | "prompt" | "type">

/**
 * 解答中の挑戦。用語集とセグメントから語義設問の対象語句を除く
 */
export type InProgressAttemptView = {
  id: number
  attribution: PassageAttribution
  blocks: AttemptBlockView[]
  expiresAt: Date
  glossary: AttemptGlossaryEntryView[]
  passage: AttemptPassageView
  questions: AttemptQuestionView[]
  serverNow: Date
  startedAt: Date
  status: "in_progress"
  /**
   * 開始時点の制限時間
   */
  timeLimitSeconds: number
}

/**
 * 期限切れの挑戦
 */
export type ExpiredAttemptView = { id: number; passage: AttemptPassageView; startedAt: Date; status: "expired" }

/**
 * 挑戦の取得の結果（提出済みの形は提出 API と合わせて足す）
 */
export type AttemptView = ExpiredAttemptView | InProgressAttemptView

/**
 * 問題の概要。挑戦がある問題は一度公開されているので難易度を必ず持つ（公開の条件。非公開に戻しても消えない）
 */
const buildPassageView = (passage: Passage): AttemptPassageView => {
  if (passage.difficulty === null) throw new Error(`Passage with an attempt has no difficulty: id=${passage.id}`)
  return { id: passage.id, difficulty: passage.difficulty, title: passage.title, wordCount: passage.wordCount }
}

/**
 * セグメントから位置を外す（位置は根拠のハイライトの計算に使い、レスポンスには出さない）
 */
const stripSegmentRange = ({ glossaryEntryId, kind, text }: SegmentWithRange): PassageSegment =>
  glossaryEntryId === undefined ? { kind, text } : { glossaryEntryId, kind, text }

/**
 * 解答中の形。語義設問の対象語句を用語集から外してからセグメントに分けるので、その語句は普通の単語になる（押すと辞書を引く）。
 * 設問は正解が混ざらないよう、出してよい列だけを明示的に取り出す
 */
const buildInProgressView = (attempt: ReadingAttempt, content: AttemptContent, now: Date): InProgressAttemptView => {
  /**
   * 対象の語句を持つのは vocabulary の設問だけ
   */
  const hiddenGlossaryEntryIds = new Set(
    content.questions.flatMap((question) => (question.targetGlossaryEntryId === null ? [] : [question.targetGlossaryEntryId])),
  )
  const glossary = content.glossary.filter((entry) => !hiddenGlossaryEntryIds.has(entry.id))
  const { blocks } = content.passage
  const segmentsByBlock = segmentPassage(blocks, glossary)
  const paragraphNumbers = numberParagraphs(blocks)

  return {
    id: attempt.id,
    attribution: buildAttribution(content.source, content.passage),
    blocks: blocks.map((block, index) => ({
      lang: block.lang ?? null,
      paragraphNumber: paragraphNumbers[index] ?? null,
      segments: (segmentsByBlock[index] ?? []).map(stripSegmentRange),
      text: block.text,
      translationJa: block.type === "code" ? null : block.translationJa ?? null,
      type: block.type,
    })),
    expiresAt: calculateExpiresAt(attempt.startedAt),
    glossary: glossary.map((entry) => ({
      id: entry.id,
      lemma: entry.lemma,
      meaningJa: entry.meaningJa,
      noteJa: entry.noteJa,
      partOfSpeech: entry.partOfSpeech,
      surface: entry.surface,
    })),
    passage: buildPassageView(content.passage),
    questions: content.questions.map((question) => ({
      id: question.id,
      choices: question.choices,
      orderIndex: question.orderIndex,
      prompt: question.prompt,
      type: question.type,
    })),
    serverNow: now,
    startedAt: attempt.startedAt,
    status: "in_progress",
    timeLimitSeconds: attempt.timeLimitSeconds,
  }
}

const buildExpiredView = (attempt: ReadingAttempt, content: AttemptContent): ExpiredAttemptView => ({
  id: attempt.id,
  passage: buildPassageView(content.passage),
  startedAt: attempt.startedAt,
  status: "expired",
})

/**
 * 挑戦の開始。そのユーザーの期限切れの挑戦中を expired にしてから、期限内の挑戦中があればそれを返し（isCreated: false）、
 * 無ければ新しく作る（isCreated: true）。新しく始められるのは公開中の問題だけで、非公開に戻された問題でも挑戦中なら再開できる
 */
export const startAttempt = async (
  input: { now: Date; passageId: number; userId: number },
  repo: AttemptRepo,
): Promise<Result<{ isCreated: boolean; view: InProgressAttemptView }>> => {
  /**
   * 削除済みユーザーの access token が残っている場合（access token は JWT なので最長 15 分は失効させられない）
   */
  const user = await repo.userRepository.findById(input.userId)
  if (!user) {
    logger.debug("AttemptService: User not found", { userId: input.userId })
    return err(unauthorizedError("User not found"))
  }

  const aliveSince = calculateAliveSince(input.now)
  await repo.readingAttemptRepository.expireStale(input.userId, aliveSince)

  const content = await repo.passageRepository.findAttemptContentById(input.passageId)
  if (!content) {
    logger.debug("AttemptService: Passage not found", { passageId: input.passageId })
    return err(notFoundError("Passage not found"))
  }

  const existing = await repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, aliveSince)
  if (existing) return ok({ isCreated: false, view: buildInProgressView(existing, content, input.now) })

  const { passage } = content
  if (passage.status !== "published") {
    logger.debug("AttemptService: Passage is not published", { passageId: input.passageId, status: passage.status })
    return err(notFoundError("Passage not found"))
  }
  /**
   * 公開中の問題は制限時間を必ず持つ（公開の条件）
   */
  if (passage.timeLimitSeconds === null) throw new Error(`Published passage has no time limit: id=${passage.id}`)

  const created = await repo.readingAttemptRepository.createInProgress({
    passageId: input.passageId,
    startedAt: input.now,
    timeLimitSeconds: passage.timeLimitSeconds,
    userId: input.userId,
  })
  /**
   * 同時に開始されて部分 unique index に当たったときは、先に作られた方を返す
   */
  const attempt = created ?? await repo.readingAttemptRepository.findAliveInProgress(input.userId, input.passageId, aliveSince)
  if (!attempt) throw new Error(`In-progress attempt disappeared after conflict: passageId=${input.passageId}, userId=${input.userId}`)
  if (created) logger.info("AttemptService: Attempt started", { attemptId: created.id, passageId: input.passageId, userId: input.userId })
  return ok({ isCreated: created !== null, view: buildInProgressView(attempt, content, input.now) })
}

/**
 * 自分の挑戦の取得。そのユーザーの期限切れの挑戦中を expired にしてから読む。他人の挑戦・存在しない ID は 404（存在を明かさない）
 */
export const getAttempt = async (
  input: { attemptId: number; now: Date; userId: number },
  repo: Omit<AttemptRepo, "userRepository">,
): Promise<Result<AttemptView>> => {
  await repo.readingAttemptRepository.expireStale(input.userId, calculateAliveSince(input.now))

  const attempt = await repo.readingAttemptRepository.findByIdForUser(input.attemptId, input.userId)
  if (!attempt) {
    logger.debug("AttemptService: Attempt not found", { attemptId: input.attemptId, userId: input.userId })
    return err(notFoundError("Attempt not found"))
  }

  /**
   * passages は物理削除しない（reading_attempts の外部キーは restrict）ので、挑戦があれば問題もある
   */
  const content = await repo.passageRepository.findAttemptContentById(attempt.passageId)
  if (!content) throw new Error(`Passage of attempt not found: attemptId=${attempt.id}, passageId=${attempt.passageId}`)

  if (attempt.status === "submitted") {
    /**
     * 結果の形は提出 API（reading-practice step4）で返す
     */
    return err(conflictError("Submitted attempt is not supported yet"))
  }
  /**
   * expireStale の直後でも read replica の遅れで更新前の行が読めることがあるので、in_progress も開始時刻で期限を判定する
   */
  if (attempt.status === "expired" || isAttemptExpired(attempt.startedAt, input.now)) {
    return ok(buildExpiredView(attempt, content))
  }
  return ok(buildInProgressView(attempt, content, input.now))
}
