import { and, asc, DrizzleClient, eq, passages, sourceDocuments, sql } from "@repo/db"
import type { SourceDocument } from "@repo/domain"

import type { MarkFetchedInput, SourceDocumentRepository } from "../source-document-repository"

/**
 * Drizzleの型
 */
type SourceDocumentRow = typeof sourceDocuments.$inferSelect

/**
 * Drizzle 実装の SourceDocumentRepository
 */
export class DrizzleSourceDocumentRepository implements SourceDocumentRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findBySourceId(sourceId: number): Promise<SourceDocument[]> {
    const rows = await this._db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.sourceId, sourceId))
      .orderBy(asc(sourceDocuments.id))
    return rows.map((row) => this._toDomain(row))
  }

  public async findWithCollectedPassages(sourceId: number): Promise<SourceDocument[]> {
    const rows = await this._db
      .select()
      .from(sourceDocuments)
      .where(and(
        eq(sourceDocuments.sourceId, sourceId),
        sql`EXISTS (SELECT 1 FROM ${passages} WHERE ${passages.sourceDocumentId} = ${sourceDocuments.id} AND ${passages.status} = 'collected')`,
      ))
      .orderBy(asc(sourceDocuments.id))
    return rows.map((row) => this._toDomain(row))
  }

  public async markFetched(id: number, input: MarkFetchedInput): Promise<void> {
    await this._db
      .update(sourceDocuments)
      .set({
        blobSha: input.blobSha,
        commitSha: input.commitSha,
        contentHash: input.contentHash,
        extractionVersion: input.extractionVersion,
        fetchedAt: input.fetchedAt,
        title: input.title,
      })
      .where(eq(sourceDocuments.id, id))
  }

  public async upsertByPath(input: { path: string; sourceId: number; title: string | null }): Promise<SourceDocument> {
    const [row] = await this._db
      .insert(sourceDocuments)
      .values({ path: input.path, sourceId: input.sourceId, title: input.title })
      .onConflictDoUpdate({ set: { title: input.title }, target: [sourceDocuments.sourceId, sourceDocuments.path] })
      .returning()
    return this._toDomain(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomain(row: SourceDocumentRow): SourceDocument {
    return {
      id: row.id,
      blobSha: row.blobSha,
      commitSha: row.commitSha,
      contentHash: row.contentHash,
      etag: row.etag,
      extractionVersion: row.extractionVersion,
      fetchedAt: row.fetchedAt,
      httpStatus: row.httpStatus,
      lastModified: row.lastModified,
      path: row.path,
      sitemapLastmod: row.sitemapLastmod,
      sourceId: row.sourceId,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
