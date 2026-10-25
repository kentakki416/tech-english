import type { Passage } from "@repo/domain"

/**
 * 収集で作る本文候補の列。status などその他の列は DB の既定値（status = collected）になる
 */
export type CreatePassageInput = Pick<
  Passage,
  "blocks" | "contentHash" | "sourceCommitSha" | "sourceDocumentId" | "sourcePath" | "sourceRetrievedAt" | "title" | "wordCount"
>

/**
 * worker の収集で必要な本文候補の操作（挿入・見出しの確認・collected の却下）
 */
export interface PassageRepository {
  /**
   * 文書の本文候補のうち、生成中か生成したもの（generating・draft・published と、生成した後に却下した rejected）の見出し（重複を除く）。
   * 生成した後の却下は generated_at で見分ける（LLM・管理者の却下は入り、収集が外した未生成の collected の却下は入らない）
   */
  findGeneratedOrGeneratingTitles(sourceDocumentId: number): Promise<string[]>
  /**
   * content_hash が既にある行は飛ばし、挿入した件数を返す。同じ内容の再取り込みを unique 制約で弾く（冪等）
   */
  insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number>
  /**
   * 文書（sourceDocumentIds）の collected のうち、content_hash が keepContentHashes に無いものを rejected にして reason を残し、件数を返す。
   * collected 以外の行（生成中・下書き・公開済みなど）は変えない
   */
  rejectCollected(input: { keepContentHashes: string[]; reason: string; sourceDocumentIds: number[] }): Promise<number>
}
