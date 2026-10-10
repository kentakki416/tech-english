import { Memo } from "@repo/domain"
import { err, notFoundError, ok, Result } from "@repo/errors"
import type { EventTracker } from "@repo/events"
import { logger } from "@repo/logger"

import { CreateMemoInput, MemoRepository, UpdateMemoInput } from "../repository"

type MemoRepo = { memoRepository: MemoRepository }

/**
 * 行動イベントの送出に必要な依存。
 *
 * 送出は fire-and-forget で、失敗しても Result には影響しない。
 * **操作が成功したときだけ記録する**（失敗を記録したい場合は別イベントにする。
 * 成功イベントに成否フラグを混ぜると集計時に必ず事故る）。
 *
 * `userId` が undefined なのは `/api/memo` が PUBLIC_PATHS に含まれ
 * 未ログインでも呼べるため。**匿名ユーザーは追跡しない方針**なので、
 * その場合は送出そのものをスキップする。
 */
type EventDeps = { eventTracker: EventTracker; userId: number | undefined }

/** 未ログイン時は記録しない（匿名追跡をしない方針） */
const trackIfSignedIn = (
  deps: EventDeps,
  event: { name: "memo_created" | "memo_deleted" | "memo_updated"; memoId: number },
): void => {
  if (deps.userId === undefined) return
  deps.eventTracker.track({
    name: event.name,
    properties: { memo_id: event.memoId },
    source: "api",
    userId: deps.userId,
  })
}

/**
 * メモ一覧を取得
 */
export const getAllMemos = async (
  repo: MemoRepo
): Promise<Result<Memo[]>> => {
  logger.debug("MemoService: Fetching all memos")
  const memos = await repo.memoRepository.findAll()
  logger.debug("MemoService: Memos fetched", { count: memos.length })
  return ok(memos)
}

/**
 * メモをIDで取得
 */
export const getMemoById = async (
  id: number,
  repo: MemoRepo
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Fetching memo by ID", { id })
  const memo = await repo.memoRepository.findById(id)
  if (!memo) {
    logger.debug("MemoService: Memo not found", { id })
    return err(notFoundError("Memo not found"))
  }
  return ok(memo)
}

/**
 * メモを作成
 */
export const createMemo = async (
  data: CreateMemoInput,
  repo: MemoRepo,
  deps: EventDeps
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Creating memo", { title: data.title })
  const memo = await repo.memoRepository.create(data)
  logger.debug("MemoService: Memo created", { id: memo.id })

  trackIfSignedIn(deps, { memoId: memo.id, name: "memo_created" })

  return ok(memo)
}

/**
 * メモを更新
 */
export const updateMemo = async (
  id: number,
  data: UpdateMemoInput,
  repo: MemoRepo,
  deps: EventDeps
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Updating memo", { id })
  const existing = await repo.memoRepository.findById(id)
  if (!existing) {
    logger.debug("MemoService: Memo not found for update", { id })
    return err(notFoundError("Memo not found"))
  }
  const memo = await repo.memoRepository.update(id, data)
  logger.debug("MemoService: Memo updated", { id: memo.id })

  trackIfSignedIn(deps, { memoId: memo.id, name: "memo_updated" })

  return ok(memo)
}

/**
 * メモを削除
 */
export const deleteMemo = async (
  id: number,
  repo: MemoRepo,
  deps: EventDeps
): Promise<Result<{ deleted: true }>> => {
  logger.debug("MemoService: Deleting memo", { id })
  const existing = await repo.memoRepository.findById(id)
  if (!existing) {
    logger.debug("MemoService: Memo not found for deletion", { id })
    return err(notFoundError("Memo not found"))
  }
  await repo.memoRepository.deleteById(id)
  logger.debug("MemoService: Memo deleted", { id })

  /** 物理削除なので DB からは復元できない。ここで記録しないと永久に失われる */
  trackIfSignedIn(deps, { memoId: id, name: "memo_deleted" })

  return ok({ deleted: true })
}
