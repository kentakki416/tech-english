import { and, asc, DrizzleClient, eq, inArray, isNull, lt, or, passages, sourceDocuments, sql } from "@repo/db"
import type { SourceDocument } from "@repo/domain"

import { GONE_HTTP_STATUSES } from "../../const/collection"
import type { DiscoveredDocumentInput, MarkFetchedInput, SourceDocumentRepository } from "../source-document-repository"

/**
 * Drizzleの型
 */
type SourceDocumentRow = typeof sourceDocuments.$inferSelect

/**
 * upsertDiscovered の 1 回の INSERT に入れる行数（バインド変数の上限を超えないため）
 */
const UPSERT_BATCH_SIZE = 500

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

  public async findFetchQueue(input: { limit: number; refetchBefore: Date; sourceId: number }): Promise<SourceDocument[]> {
    const rows = await this._db
      .select()
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.sourceId, input.sourceId),
          or(isNull(sourceDocuments.httpStatus), sql`NOT (${inArray(sourceDocuments.httpStatus, GONE_HTTP_STATUSES)})`),
          or(
            isNull(sourceDocuments.fetchedAt),
            sql`${sourceDocuments.sitemapLastmod} > ${sourceDocuments.fetchedAt}`,
            lt(sourceDocuments.fetchedAt, input.refetchBefore),
          ),
        ),
      )
      .orderBy(sql`${sourceDocuments.fetchedAt} ASC NULLS FIRST`, asc(sourceDocuments.id))
      .limit(input.limit)
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
        etag: input.etag,
        extractionVersion: input.extractionVersion,
        fetchedAt: input.fetchedAt,
        httpStatus: input.httpStatus,
        lastModified: input.lastModified,
        title: input.title,
      })
      .where(eq(sourceDocuments.id, id))
  }

  public async markResponse(id: number, input: { fetchedAt: Date; httpStatus: number | null }): Promise<void> {
    await this._db
      .update(sourceDocuments)
      .set({ fetchedAt: input.fetchedAt, httpStatus: input.httpStatus })
      .where(eq(sourceDocuments.id, id))
  }

  /**
   * UPSERT_BATCH_SIZE 件ずつ INSERT ... ON CONFLICT DO UPDATE する。
   * 値が変わらない行（sitemap_lastmod が同じか null で、404 / 410 から戻さない）は setWhere で更新しない（無駄な書き込みを避ける）
   */
  public async upsertDiscovered(
    sourceId: number,
    inputs: DiscoveredDocumentInput[],
    options: { shouldReviveGone: boolean },
  ): Promise<void> {
    const isGone = inArray(sourceDocuments.httpStatus, GONE_HTTP_STATUSES)
    const shouldRevive = options.shouldReviveGone
      ? isGone
      : sql`${isGone} AND excluded.sitemap_lastmod > ${sourceDocuments.fetchedAt}`
    const isLastmodChanged = sql`excluded.sitemap_lastmod IS NOT NULL AND excluded.sitemap_lastmod IS DISTINCT FROM ${sourceDocuments.sitemapLastmod}`
    for (let start = 0; start < inputs.length; start += UPSERT_BATCH_SIZE) {
      const batch = inputs.slice(start, start + UPSERT_BATCH_SIZE)
      await this._db
        .insert(sourceDocuments)
        .values(batch.map((input) => ({ path: input.path, sitemapLastmod: input.sitemapLastmod, sourceId })))
        .onConflictDoUpdate({
          set: {
            httpStatus: sql`CASE WHEN ${shouldRevive} THEN NULL ELSE ${sourceDocuments.httpStatus} END`,
            sitemapLastmod: sql`COALESCE(excluded.sitemap_lastmod, ${sourceDocuments.sitemapLastmod})`,
          },
          setWhere: sql`(${isLastmodChanged}) OR (${shouldRevive})`,
          target: [sourceDocuments.sourceId, sourceDocuments.path],
        })
    }
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
