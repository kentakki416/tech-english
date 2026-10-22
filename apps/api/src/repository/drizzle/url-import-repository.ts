import { and, DrizzleClient, eq, inArray, notInArray, passages, sourceDocuments, sql } from "@repo/db"
import type { Passage } from "@repo/domain"

import type { TransactionContext } from "../transaction"
import type { CandidateInput, FetchedDocumentInput, ImportPassage, UrlImportRepository } from "../url-import-repository"

import { resolveDrizzleClient } from "./transaction-runner"
import { convertInstantToUtcTimestamp } from "./utc-timestamp"

const importPassageColumns = {
  id: passages.id,
  contentHash: passages.contentHash,
  generatedAt: passages.generatedAt,
  status: passages.status,
  title: passages.title,
}

export class DrizzleUrlImportRepository implements UrlImportRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findDocumentPassages(input: { path: string; sourceId: number }, tx?: TransactionContext): Promise<ImportPassage[]> {
    return resolveDrizzleClient(this._db, tx)
      .select(importPassageColumns)
      .from(passages)
      .innerJoin(sourceDocuments, eq(sourceDocuments.id, passages.sourceDocumentId))
      .where(and(eq(sourceDocuments.sourceId, input.sourceId), eq(sourceDocuments.path, input.path)))
  }

  public async findPassagesByContentHashes(contentHashes: string[], tx?: TransactionContext): Promise<ImportPassage[]> {
    if (contentHashes.length === 0) return []
    return resolveDrizzleClient(this._db, tx)
      .select(importPassageColumns)
      .from(passages)
      .where(inArray(passages.contentHash, contentHashes))
  }

  public async insertCandidates(inputs: CandidateInput[], tx: TransactionContext): Promise<number[]> {
    if (inputs.length === 0) return []
    const rows = await resolveDrizzleClient(this._db, tx)
      .insert(passages)
      .values(inputs)
      .onConflictDoNothing({ target: passages.contentHash })
      .returning({ id: passages.id })
    return rows.map((row) => row.id)
  }

  public async prioritizeCollected(
    input: { contentHashes: string[]; now: Date },
    tx: TransactionContext,
  ): Promise<Pick<Passage, "contentHash" | "id" | "title">[]> {
    if (input.contentHashes.length === 0) return []
    return resolveDrizzleClient(this._db, tx)
      .update(passages)
      .set({ generationPrioritizedAt: sql`coalesce(${passages.generationPrioritizedAt}, ${convertInstantToUtcTimestamp(input.now)})` })
      .where(and(eq(passages.status, "collected"), inArray(passages.contentHash, input.contentHashes)))
      .returning({ id: passages.id, contentHash: passages.contentHash, title: passages.title })
  }

  /**
   * keepContentHashes が空なら NOT IN を付けない（文書の collected をすべて却下する）
   */
  public async rejectCollected(
    input: { keepContentHashes: string[]; reason: string; sourceDocumentId: number },
    tx: TransactionContext,
  ): Promise<number> {
    const rows = await resolveDrizzleClient(this._db, tx)
      .update(passages)
      .set({ rejectReason: input.reason, status: "rejected" })
      .where(and(
        eq(passages.sourceDocumentId, input.sourceDocumentId),
        eq(passages.status, "collected"),
        ...(input.keepContentHashes.length === 0 ? [] : [notInArray(passages.contentHash, input.keepContentHashes)]),
      ))
      .returning({ id: passages.id })
    return rows.length
  }

  /**
   * onConflictDoUpdate の set には $onUpdate が効かないので updatedAt を明示する
   */
  public async upsertFetchedDocument(input: FetchedDocumentInput, tx: TransactionContext): Promise<{ id: number }> {
    const values = {
      blobSha: null,
      commitSha: null,
      contentHash: input.contentHash,
      extractionVersion: input.extractionVersion,
      fetchedAt: input.fetchedAt,
      title: input.title,
    }
    const [row] = await resolveDrizzleClient(this._db, tx)
      .insert(sourceDocuments)
      .values({ ...values, path: input.path, sourceId: input.sourceId })
      .onConflictDoUpdate({ set: { ...values, updatedAt: input.fetchedAt }, target: [sourceDocuments.sourceId, sourceDocuments.path] })
      .returning({ id: sourceDocuments.id })
    return row
  }
}
