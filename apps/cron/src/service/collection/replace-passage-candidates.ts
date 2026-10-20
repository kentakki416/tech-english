import type { PassageChunk } from "@repo/content-extractor"
import { logger } from "@repo/logger"

import { SUPERSEDED_PASSAGE_REJECT_REASON } from "../../const/collection"

import type { CollectionRepo } from "./types"

/**
 * 文書の未生成（collected）の本文候補を、新しく切り分けた塊で置き換え、挿入した件数を返す。
 *
 * 1. 同じ見出しの本文候補が生成中か生成した（下書き・公開済み・生成した後に却下した）塊は挿入しない。同じ節の問題を二重に作らず、
 *    題材に向かないと判断した節をもう一度生成に回さないため
 * 2. 残りの塊を挿入する（同じ content_hash の行は飛ばす）
 * 3. その文書の collected のうち、残した塊に無いもの（前の切り分け・同じ見出しの下書きがある節）を却下する
 *
 * 挿入と却下は同じトランザクションにしない。間で落ちても、呼び出し側が抽出の版を最後に記録するので次の収集でやり直し、
 * 却下は何度行っても結果が同じ
 */
export const replacePassageCandidates = async (
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
  const generatedTitles = new Set(await repo.passageRepository.findGeneratedOrGeneratingTitles(input.documentId))
  const candidatesToInsert = input.candidates.filter((candidate) => !generatedTitles.has(candidate.title))
  const createdPassageCount = await repo.passageRepository.insertIgnoringDuplicates(
    candidatesToInsert.map((candidate) => ({
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
    keepContentHashes: candidatesToInsert.map((candidate) => candidate.contentHash),
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
