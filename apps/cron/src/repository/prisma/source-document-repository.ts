import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import type { SourceDocument } from "@repo/domain"

import type { MarkFetchedInput, SourceDocumentRepository } from "../source-document-repository"

/**
 * Prismaの型
 */
type SourceDocumentRow = PrismaTypes.SourceDocumentGetPayload<{}>

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
