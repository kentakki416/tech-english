import { and, DrizzleClient, eq, inArray, isNotNull, notInArray, or, passages } from "@repo/db"

import type { CreatePassageInput, PassageRepository } from "../passage-repository"

/**
 * Drizzle 実装の PassageRepository（収集で使う操作だけ）
 */
export class DrizzlePassageRepository implements PassageRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findGeneratedOrGeneratingTitles(sourceDocumentId: number): Promise<string[]> {
    const rows = await this._db
      .selectDistinct({ title: passages.title })
      .from(passages)
      .where(and(
        eq(passages.sourceDocumentId, sourceDocumentId),
        or(
          inArray(passages.status, ["draft", "generating", "published"]),
          and(eq(passages.status, "rejected"), isNotNull(passages.generatedAt)),
        ),
      ))
    return rows.map((row) => row.title)
  }

  /**
   * ON CONFLICT (content_hash) DO NOTHING で挿入し、RETURNING で返った行（実際に挿入した行）を数える
   */
  public async insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const rows = await this._db
      .insert(passages)
      .values(inputs)
      .onConflictDoNothing({ target: passages.contentHash })
      .returning({ id: passages.id })
    return rows.length
  }

  /**
   * keepContentHashes が空なら NOT IN を付けない（文書の collected をすべて却下する）
   */
  public async rejectCollected(input: {
    keepContentHashes: string[]
    reason: string
    sourceDocumentIds: number[]
  }): Promise<number> {
    if (input.sourceDocumentIds.length === 0) return 0
    const rows = await this._db
      .update(passages)
      .set({ rejectReason: input.reason, status: "rejected" })
      .where(and(
        inArray(passages.sourceDocumentId, input.sourceDocumentIds),
        eq(passages.status, "collected"),
        ...(input.keepContentHashes.length === 0 ? [] : [notInArray(passages.contentHash, input.keepContentHashes)]),
      ))
      .returning({ id: passages.id })
    return rows.length
  }
}
