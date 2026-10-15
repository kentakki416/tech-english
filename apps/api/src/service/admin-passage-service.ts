import type { PassageStatus, Question } from "@repo/domain"
import { badRequestError, conflictError, err, notFoundError, ok, Result } from "@repo/errors"
import { logger } from "@repo/logger"

import { decodeAdminPassageCursor, encodeAdminPassageCursor } from "../lib/admin-passage-cursor"
import { type AdminPassageEditInput, buildDraftEditContent } from "../lib/admin-passage-edit"
import { resolveAudioStatus } from "../lib/passage-audio"
import { listPublishViolations } from "../lib/passage-publish-check"
import type {
  AdminPassageDetail,
  AdminPassageListItem,
  PassageAudioRepository,
  PassageRepository,
  TransactionRunner,
} from "../repository"

type PassageRepo = { passageRepository: PassageRepository }

/**
 * 問題一覧の条件（cursor は前のページの nextCursor）
 */
export type AdminPassageListInput = {
  cursor?: string
  limit: number
  needsAttention?: boolean
  sourceId?: number
  status: PassageStatus
}

/**
 * 問題一覧の結果。statusCounts は絞り込みを無視した全体の状態ごとの件数
 */
export type AdminPassageList = {
  hasMore: boolean
  items: AdminPassageListItem[]
  nextCursor: string | null
  statusCounts: Record<PassageStatus, number>
}

export type AdminPassageStatusChange = { id: number; status: PassageStatus }

export type AdminPassageAttentionResolution = { id: number; attentionReasons: string[]; needsAttention: boolean }

/**
 * 再生成できる状態（生成済みで、公開中でないもの）
 */
const REGENERATABLE_STATUSES: PassageStatus[] = ["draft", "rejected", "failed"]

/**
 * 設問の id の集合が保存済みと完全に同じか（数の変更・削除・追加・別の id への差し替えが無い）
 */
const hasSameQuestionIds = (existing: Question[], requestedIds: (number | null)[]): boolean => {
  const existingIds = new Set(existing.map((question) => question.id))
  return requestedIds.length === existingIds.size
    && new Set(requestedIds).size === requestedIds.length
    && requestedIds.every((id) => id !== null && existingIds.has(id))
}

/**
 * 問題を取得し、無ければ 404、状態が allowedStatuses に無ければ 409 にする
 */
const findDetailInStatus = async (
  id: number,
  allowedStatuses: PassageStatus[],
  repo: PassageRepo,
): Promise<Result<AdminPassageDetail>> => {
  const detail = await repo.passageRepository.findAdminDetail(id)
  if (!detail) {
    logger.debug("AdminPassageService: Passage not found", { id })
    return err(notFoundError("Passage not found"))
  }
  if (!allowedStatuses.includes(detail.passage.status)) {
    logger.debug("AdminPassageService: Passage status does not allow the operation", {
      allowedStatuses,
      id,
      status: detail.passage.status,
    })
    return err(conflictError(`Passage status must be one of: ${allowedStatuses.join(", ")}`))
  }
  return ok(detail)
}

/**
 * 問題一覧（状態・ソース・要確認で絞り込み、cursor ページング）と状態ごとの件数
 */
export const getAdminPassageList = async (
  input: AdminPassageListInput,
  repo: PassageRepo,
): Promise<Result<AdminPassageList>> => {
  const cursor = input.cursor === undefined ? null : decodeAdminPassageCursor(input.cursor)
  if (input.cursor !== undefined && !cursor) return err(badRequestError("Invalid cursor"))

  const [rows, statusCounts] = await Promise.all([
    repo.passageRepository.findAdminList({
      cursor,
      limit: input.limit,
      needsAttention: input.needsAttention,
      sourceId: input.sourceId,
      status: input.status,
    }),
    repo.passageRepository.countByStatus(),
  ])
  /**
   * Repository は limit + 1 件まで返す。余った 1 件があれば次のページがある
   */
  const hasMore = rows.length > input.limit
  const items = rows.slice(0, input.limit)
  const last = items[items.length - 1]
  const nextCursor = hasMore && last
    ? encodeAdminPassageCursor({
      id: last.passage.id,
      needsAttention: last.passage.needsAttention,
      updatedAt: last.passage.updatedAt,
    })
    : null
  return ok({ hasMore, items, nextCursor, statusCounts })
}

export const getAdminPassageDetail = async (id: number, repo: PassageRepo): Promise<Result<AdminPassageDetail>> => {
  const detail = await repo.passageRepository.findAdminDetail(id)
  if (!detail) {
    logger.debug("AdminPassageService: Passage not found", { id })
    return err(notFoundError("Passage not found"))
  }
  return ok(detail)
}

/**
 * 下書きを保存する（draft のときだけ）。用語集の位置は新しい英文から求め直す。
 * 挑戦がある問題は設問の id の集合を変えられない（過去の回答が指す設問を消さないため。数の変更・削除・追加はすべて 409）
 */
export const updateAdminPassage = async (
  id: number,
  input: AdminPassageEditInput,
  repo: PassageRepo,
): Promise<Result<AdminPassageDetail>> => {
  const found = await findDetailInStatus(id, ["draft"], repo)
  if (!found.ok) return found
  const detail = found.value

  if (detail.attemptCount > 0 && !hasSameQuestionIds(detail.questions, input.questions.map((question) => question.id))) {
    logger.debug("AdminPassageService: Questions of an attempted passage cannot be added or removed", {
      attemptCount: detail.attemptCount,
      id,
    })
    return err(conflictError("Questions of an attempted passage cannot be added or removed"))
  }

  const built = buildDraftEditContent(detail, input)
  if (!built.ok) {
    logger.debug("AdminPassageService: Invalid draft content", { codes: built.details.map((detail) => detail.code), id })
    return err(badRequestError("Invalid draft content", built.details))
  }

  if (!await repo.passageRepository.updateDraftContent(id, built.content)) {
    logger.debug("AdminPassageService: Passage is no longer a draft", { id })
    return err(conflictError("Passage is no longer a draft"))
  }
  logger.info("AdminPassageService: Draft updated", { id })

  const updated = await repo.passageRepository.findAdminDetail(id)
  if (!updated) return err(notFoundError("Passage not found"))
  return ok(updated)
}

/**
 * 公開する（draft のときだけ）。公開の条件を満たさなければ 400 で、満たしていない条件を details に返す。
 * 読み上げの音声が failed なら、同じトランザクションで pending に戻す（失敗の回数とエラーも消す。admin の再試行と同じ処理）。
 * 本文を直して再公開したのに failed のまま作り直されない、ということが無いように
 */
export const publishAdminPassage = async (
  id: number,
  now: Date,
  repo: PassageRepo & { passageAudioRepository: PassageAudioRepository; transactionRunner: TransactionRunner },
): Promise<Result<AdminPassageStatusChange>> => {
  const found = await findDetailInStatus(id, ["draft"], repo)
  if (!found.ok) return found

  const violations = listPublishViolations(found.value)
  if (violations.length > 0) {
    logger.debug("AdminPassageService: Passage does not meet the publish conditions", {
      codes: violations.map((violation) => violation.code),
      id,
    })
    return err(badRequestError("Passage does not meet the publish conditions", violations))
  }

  const published = await repo.transactionRunner.run(async (tx) => {
    if (!await repo.passageRepository.transitionStatus(id, { from: ["draft"], publishedAt: now, reviewedAt: now, to: "published" }, tx)) {
      return { isAudioReset: false, isPublished: false }
    }
    return { isAudioReset: await repo.passageAudioRepository.resetFailed(id, tx), isPublished: true }
  })
  if (!published.isPublished) {
    logger.debug("AdminPassageService: Passage status changed during publish", { id })
    return err(conflictError("Passage status changed"))
  }
  logger.info("AdminPassageService: Passage published", { id, isAudioReset: published.isAudioReset })
  return ok({ id, status: "published" })
}

/**
 * 却下する（draft のときだけ）。理由を残す
 */
export const rejectAdminPassage = async (
  id: number,
  reason: string,
  now: Date,
  repo: PassageRepo,
): Promise<Result<AdminPassageStatusChange>> => {
  const found = await findDetailInStatus(id, ["draft"], repo)
  if (!found.ok) return found

  if (!await repo.passageRepository.transitionStatus(id, { from: ["draft"], rejectReason: reason, reviewedAt: now, to: "rejected" })) {
    logger.debug("AdminPassageService: Passage status changed during reject", { id })
    return err(conflictError("Passage status changed"))
  }
  logger.info("AdminPassageService: Passage rejected", { id })
  return ok({ id, status: "rejected" })
}

/**
 * 公開中の問題を下書きに戻す（published のときだけ）。published_at は残す
 */
export const unpublishAdminPassage = async (id: number, repo: PassageRepo): Promise<Result<AdminPassageStatusChange>> => {
  const found = await findDetailInStatus(id, ["published"], repo)
  if (!found.ok) return found

  if (!await repo.passageRepository.transitionStatus(id, { from: ["published"], to: "draft" })) {
    logger.debug("AdminPassageService: Passage status changed during unpublish", { id })
    return err(conflictError("Passage status changed"))
  }
  logger.info("AdminPassageService: Passage unpublished", { id })
  return ok({ id, status: "draft" })
}

/**
 * 生成した内容を消して生成待ち（collected）に戻す（draft / rejected / failed のときだけ）。挑戦が 1 件でもあれば 409
 */
export const regenerateAdminPassage = async (id: number, repo: PassageRepo): Promise<Result<AdminPassageStatusChange>> => {
  const found = await findDetailInStatus(id, REGENERATABLE_STATUSES, repo)
  if (!found.ok) return found

  if (found.value.attemptCount > 0) {
    logger.debug("AdminPassageService: Attempted passage cannot be regenerated", { attemptCount: found.value.attemptCount, id })
    return err(conflictError("Attempted passage cannot be regenerated"))
  }

  if (!await repo.passageRepository.resetForRegeneration(id, REGENERATABLE_STATUSES)) {
    logger.debug("AdminPassageService: Passage changed during regenerate", { id })
    return err(conflictError("Passage status changed or an attempt was started"))
  }
  logger.info("AdminPassageService: Passage reset for regeneration", { id })
  return ok({ id, status: "collected" })
}

/**
 * 却下を取り消す（rejected のときだけ）。設問があれば draft、無ければ（LLM が不向きと判定したもの）collected に戻す。
 * 挑戦があっても取り消せる（設問は消さない）
 */
export const restoreAdminPassage = async (id: number, repo: PassageRepo): Promise<Result<AdminPassageStatusChange>> => {
  const found = await findDetailInStatus(id, ["rejected"], repo)
  if (!found.ok) return found

  const status = await repo.passageRepository.restoreRejected(id)
  if (status === null) {
    logger.debug("AdminPassageService: Passage status changed during restore", { id })
    return err(conflictError("Passage status changed"))
  }
  logger.info("AdminPassageService: Rejected passage restored", { id, status })
  return ok({ id, status })
}

/**
 * 要確認の印を外す（管理者が理由を確かめた・直した後に、一覧の要確認の先頭から外すため）。状態は問わず、外れていても 200
 */
export const resolveAdminPassageAttention = async (
  id: number,
  repo: PassageRepo,
): Promise<Result<AdminPassageAttentionResolution>> => {
  if (!await repo.passageRepository.clearAttention(id)) {
    logger.debug("AdminPassageService: Passage not found", { id })
    return err(notFoundError("Passage not found"))
  }
  logger.info("AdminPassageService: Passage attention resolved", { id })
  return ok({ id, attentionReasons: [], needsAttention: false })
}

/**
 * 読み上げの音声の再試行。failed のときだけ pending に戻す（attempt_count = 0）。生成タスクが次の実行で作り直す。
 * 問題が無ければ 404、音声の行が無い・failed でない（pending・generating・ready）・同時に状態が変わったときは 409
 */
export const retryAdminPassageAudio = async (
  id: number,
  repo: { passageAudioRepository: PassageAudioRepository },
): Promise<Result<{ passageId: number; status: "pending" }>> => {
  const found = await repo.passageAudioRepository.findByPassageId(id)
  if (!found) {
    logger.debug("AdminPassageService: Passage not found", { id })
    return err(notFoundError("Passage not found"))
  }
  if (found.audio?.status !== "failed") {
    logger.debug("AdminPassageService: Passage audio is not failed", { id, status: found.audio?.status ?? null })
    return err(conflictError("Passage audio can be retried only when it has failed"))
  }

  if (!await repo.passageAudioRepository.resetFailed(id)) {
    logger.debug("AdminPassageService: Passage audio changed during retry", { id })
    return err(conflictError("Passage audio status changed"))
  }
  logger.info("AdminPassageService: Passage audio reset for retry", { id })
  return ok({ passageId: id, status: "pending" })
}

/**
 * 読み上げの音声の作り直しを依頼する。表示上 ready（作成済み）のときだけ regenerate_requested_at を入れる（失敗の回数とエラーも消す）。
 * 生成タスクは次の実行で、本文の hash が同じでも Polly で作り直す（作り直す間も前の音声を返し続ける）。
 * 問題が無ければ 404、音声の行が無い・ready でない（pending・generating・failed、非公開に戻した・公開し直した後の確認待ち）・同時に状態が変わったときは 409
 */
export const regenerateAdminPassageAudio = async (
  id: number,
  now: Date,
  repo: { passageAudioRepository: PassageAudioRepository },
): Promise<Result<{ passageId: number; regenerateRequestedAt: Date }>> => {
  const found = await repo.passageAudioRepository.findByPassageId(id)
  if (!found) {
    logger.debug("AdminPassageService: Passage not found", { id })
    return err(notFoundError("Passage not found"))
  }
  const status = resolveAudioStatus(found.audio, found.passage)
  if (status !== "ready") {
    logger.debug("AdminPassageService: Passage audio is not ready", { id, status })
    return err(conflictError("Passage audio can be regenerated only when it is ready"))
  }

  if (!await repo.passageAudioRepository.requestRegeneration(id, now)) {
    logger.debug("AdminPassageService: Passage audio changed during regenerate", { id })
    return err(conflictError("Passage audio status changed"))
  }
  logger.info("AdminPassageService: Passage audio regeneration requested", { id })
  return ok({ passageId: id, regenerateRequestedAt: now })
}
