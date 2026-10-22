import type { SourceNotCollectableReason } from "@repo/domain"

/**
 * 収集できないソース（無い・サイト・無効）を収集しようとした。reason は記録の失敗の理由に使う
 */
export class SourceNotCollectableError extends Error {
  constructor(
    public readonly reason: SourceNotCollectableReason,
    sourceId: number,
  ) {
    super(`Source is not collectable: id=${sourceId} reason=${reason}`)
    this.name = "SourceNotCollectableError"
  }
}
