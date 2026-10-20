import type { SourceDocument } from "@repo/domain"
import { logger } from "@repo/logger"

import { OUT_OF_TARGET_PASSAGE_REJECT_REASON } from "../../const/collection"

import type { CollectionRepo } from "./types"

/**
 * collected の本文候補を持つ文書のうち、isOutOfTarget に当たるもの（除外パス・対象パスから外した、取得元から消えた）の
 * collected を却下する。下書き・公開済みなどは変えない（公開済みの問題は取得元から消えても残す）
 */
export const rejectOutOfTargetPassages = async (
  input: { isOutOfTarget: (document: SourceDocument) => boolean; sourceId: number },
  repo: CollectionRepo,
): Promise<void> => {
  const documents = await repo.sourceDocumentRepository.findWithCollectedPassages(input.sourceId)
  const outOfTargetDocuments = documents.filter(input.isOutOfTarget)
  if (outOfTargetDocuments.length === 0) return
  const rejectedCount = await repo.passageRepository.rejectCollected({
    keepContentHashes: [],
    reason: OUT_OF_TARGET_PASSAGE_REJECT_REASON,
    sourceDocumentIds: outOfTargetDocuments.map((document) => document.id),
  })
  logger.info("collected passages of out-of-target documents were rejected", {
    paths: outOfTargetDocuments.map((document) => document.path),
    rejectedCount,
    sourceId: input.sourceId,
  })
}
