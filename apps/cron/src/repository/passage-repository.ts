import type { Passage } from "@repo/domain"

/**
 * 収集で作る本文候補の列。status などその他の列は DB の既定値（status = collected）になる
 */
export type CreatePassageInput = Pick<
  Passage,
  "blocks" | "contentHash" | "sourceCommitSha" | "sourceDocumentId" | "sourcePath" | "sourceRetrievedAt" | "title" | "wordCount"
>

/**
 * cron 側で必要な本文候補の操作（収集・問題生成）
 */
export interface PassageRepository {
  /**
   * content_hash が既にある行は飛ばし、挿入した件数を返す。同じ内容の再取り込みを unique 制約で弾く（冪等）
   */
  insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number>
}
