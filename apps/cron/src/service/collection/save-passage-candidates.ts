import { logger } from "@repo/logger"

import { IN_USE_PASSAGE_STATUSES, SUPERSEDED_PASSAGE_REJECT_REASON } from "../../const/collection"
import type { PassageChunk } from "../../lib/document"

import type { CollectionRepo } from "./types"

/**
 * 文書を切り分けた本文候補を保存し、挿入した件数を返す。
 *
 * 1. 同じ見出しの下書き・公開済み・生成中の本文候補がある塊は挿入しない（同じ節の問題を二重に作らないため）
 * 2. 残りの塊を挿入する（同じ content_hash の行は飛ばす）
 * 3. その文書の collected のうち、挿入した塊に無いもの（前の切り分け・同じ見出しの下書きがある節）を却下する
 *
 * 挿入と却下は同じトランザクションにしない。間で落ちても、呼び出し側が抽出の版を最後に記録するので次の収集でやり直し、
 * 却下は何度行っても結果が同じ
 */
export const savePassageCandidates = async (
  input: {
    candidates: PassageChunk[]
    documentId: number
    now: Date
    sourceCommitSha: string | null
    sourceId: number
    sourcePath: string
  },
  repo: CollectionRepo,
): Promise<number> => {
  const inUseTitles = new Set(await repo.passageRepository.findTitles({
    sourceDocumentId: input.documentId,
    statuses: IN_USE_PASSAGE_STATUSES,
  }))
  const newCandidates = input.candidates.filter((candidate) => !inUseTitles.has(candidate.title))
  const createdPassageCount = await repo.passageRepository.insertIgnoringDuplicates(
    newCandidates.map((candidate) => ({
      blocks: candidate.blocks,
      contentHash: candidate.contentHash,
      sourceCommitSha: input.sourceCommitSha,
      sourceDocumentId: input.documentId,
      sourcePath: input.sourcePath,
      sourceRetrievedAt: input.now,
      title: candidate.title,
      wordCount: candidate.wordCount,
    })),
  )
  const rejectedCount = await repo.passageRepository.rejectCollected({
    keepContentHashes: newCandidates.map((candidate) => candidate.contentHash),
    reason: SUPERSEDED_PASSAGE_REJECT_REASON,
    sourceDocumentIds: [input.documentId],
  })
  if (rejectedCount > 0) {
    logger.info("superseded collected passages were rejected", {
      documentId: input.documentId,
      rejectedCount,
      sourceId: input.sourceId,
    })
  }
  return createdPassageCount
}
