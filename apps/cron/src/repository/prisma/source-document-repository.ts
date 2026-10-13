import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import type { SourceDocument } from "@repo/domain"

import { GONE_HTTP_STATUSES } from "../../const/collection"
import type { DiscoveredDocumentInput, MarkFetchedInput, SourceDocumentRepository } from "../source-document-repository"

/**
 * Prismaの型
 */
type SourceDocumentRow = PrismaTypes.SourceDocumentGetPayload<{}>

/**
 * upsertDiscovered の 1 回の INSERT に入れる行数
 */
const UPSERT_BATCH_SIZE = 500

/**
 * Prisma 実装の SourceDocumentRepository
 */
export class PrismaSourceDocumentRepository implements SourceDocumentRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findBySourceId(sourceId: number): Promise<SourceDocument[]> {
    const rows = await this._prisma.sourceDocument.findMany({ orderBy: { id: "asc" }, where: { sourceId } })
    return rows.map((row) => this._toDomain(row))
  }

  /**
   * sitemap_lastmod > fetched_at は列どうしの比較なので field reference（`fields.fetchedAt`）を使う
   */
  public async findFetchQueue(input: { limit: number; refetchBefore: Date; sourceId: number }): Promise<SourceDocument[]> {
    const rows = await this._prisma.sourceDocument.findMany({
      orderBy: [{ fetchedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
      take: input.limit,
      where: {
        AND: [
          { OR: [{ httpStatus: null }, { httpStatus: { notIn: GONE_HTTP_STATUSES } }] },
          {
            OR: [
              { fetchedAt: null },
              { sitemapLastmod: { gt: this._prisma.sourceDocument.fields.fetchedAt } },
              { fetchedAt: { lt: input.refetchBefore } },
            ],
          },
        ],
        sourceId: input.sourceId,
      },
    })
    return rows.map((row) => this._toDomain(row))
  }

  public async markFetched(id: number, input: MarkFetchedInput): Promise<void> {
    await this._prisma.sourceDocument.update({
      data: {
        blobSha: input.blobSha,
        commitSha: input.commitSha,
        contentHash: input.contentHash,
        etag: input.etag,
        fetchedAt: input.fetchedAt,
        httpStatus: input.httpStatus,
        lastModified: input.lastModified,
        title: input.title,
      },
      where: { id },
    })
  }

  public async markResponse(id: number, input: { fetchedAt: Date; httpStatus: number | null }): Promise<void> {
    await this._prisma.sourceDocument.update({
      data: { fetchedAt: input.fetchedAt, httpStatus: input.httpStatus },
      where: { id },
    })
  }

  /**
   * Prisma には一括の条件つき upsert が無いので、Drizzle 実装と同じ SQL を $executeRaw で書く（配列は unnest で渡す）。
   * 日時は ISO 文字列を timestamp にキャストして UTC のまま入れる（Prisma のセッションのタイムゾーンに依存させない）
   */
  public async upsertDiscovered(
    sourceId: number,
    inputs: DiscoveredDocumentInput[],
    options: { shouldReviveGone: boolean },
  ): Promise<void> {
    for (let start = 0; start < inputs.length; start += UPSERT_BATCH_SIZE) {
      const batch = inputs.slice(start, start + UPSERT_BATCH_SIZE)
      const paths = batch.map((input) => input.path)
      const sitemapLastmods = batch.map((input) => input.sitemapLastmod?.toISOString() ?? null)
      const now = new Date().toISOString()
      await this._prisma.$executeRaw`
        INSERT INTO source_documents (source_id, path, sitemap_lastmod, updated_at)
        SELECT ${sourceId}::integer, discovered.path, discovered.sitemap_lastmod, ${now}::timestamp(3)
        FROM unnest(${paths}::text[], ${sitemapLastmods}::timestamp(3)[]) AS discovered(path, sitemap_lastmod)
        ON CONFLICT (source_id, path) DO UPDATE SET
          http_status = CASE
            WHEN source_documents.http_status = ANY(${GONE_HTTP_STATUSES}::integer[])
              AND (${options.shouldReviveGone}::boolean OR excluded.sitemap_lastmod > source_documents.fetched_at)
            THEN NULL
            ELSE source_documents.http_status
          END,
          sitemap_lastmod = COALESCE(excluded.sitemap_lastmod, source_documents.sitemap_lastmod),
          updated_at = ${now}::timestamp(3)
        WHERE (
          excluded.sitemap_lastmod IS NOT NULL
          AND excluded.sitemap_lastmod IS DISTINCT FROM source_documents.sitemap_lastmod
        ) OR (
          source_documents.http_status = ANY(${GONE_HTTP_STATUSES}::integer[])
          AND (${options.shouldReviveGone}::boolean OR excluded.sitemap_lastmod > source_documents.fetched_at)
        )
      `
    }
  }

  public async upsertByPath(input: { path: string; sourceId: number; title: string | null }): Promise<SourceDocument> {
    const row = await this._prisma.sourceDocument.upsert({
      create: { path: input.path, sourceId: input.sourceId, title: input.title },
      update: { title: input.title },
      where: { sourceId_path: { path: input.path, sourceId: input.sourceId } },
    })
    return this._toDomain(row)
  }

  /**
   * Prismaの型 → ドメインの型に変換
   */
  private _toDomain(row: SourceDocumentRow): SourceDocument {
    return {
      id: row.id,
      blobSha: row.blobSha,
      commitSha: row.commitSha,
      contentHash: row.contentHash,
      etag: row.etag,
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
