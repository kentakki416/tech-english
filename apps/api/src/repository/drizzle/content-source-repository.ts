import { and, asc, contentSources, count, DrizzleClient, eq, gte, passages, sourceDocuments } from "@repo/db"
import type { ContentSource } from "@repo/domain"

import type {
  ContentSourceInput,
  ContentSourceRepository,
  FailedPage,
  PassageCountRow,
} from "../content-source-repository"

/**
 * Drizzleの型
 */
type ContentSourceRow = typeof contentSources.$inferSelect

/**
 * 取得に失敗したとみなす HTTP ステータスの下限
 */
const FAILED_HTTP_STATUS = 400

/**
 * 入力から、取得方法ごとの列と共通の列の値を作る（fetch_type は含めない）
 */
const buildColumnValues = (input: ContentSourceInput) => {
  const common = {
    excludeGlobs: input.excludeGlobs,
    includeGlobs: input.includeGlobs,
    isEnabled: input.isEnabled,
    kind: input.kind,
    licenseSpdx: input.licenseSpdx,
    licenseUrl: input.licenseUrl,
    name: input.name,
    tags: input.tags,
  }
  if (input.fetchType === "github_repository") {
    return {
      ...common,
      branch: input.branch,
      publicUrlStripPrefix: input.publicUrlStripPrefix,
      publicUrlTemplate: input.publicUrlTemplate,
      repository: input.repository,
    }
  }
  return {
    ...common,
    contentSelector: input.contentSelector,
    excludeSelectors: input.excludeSelectors,
    sitemapUrl: input.sitemapUrl,
    siteUrl: input.siteUrl,
    startUrl: input.startUrl,
  }
}

/**
 * Drizzle実装のソースリポジトリ
 */
export class DrizzleContentSourceRepository implements ContentSourceRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async countFailedPagesBySource(): Promise<{ count: number; sourceId: number }[]> {
    return this._db
      .select({ count: count(), sourceId: sourceDocuments.sourceId })
      .from(sourceDocuments)
      .where(gte(sourceDocuments.httpStatus, FAILED_HTTP_STATUS))
      .groupBy(sourceDocuments.sourceId)
  }

  public async countPassagesBySource(sourceId?: number): Promise<PassageCountRow[]> {
    return this._db
      .select({ count: count(), sourceId: sourceDocuments.sourceId, status: passages.status })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .where(sourceId === undefined ? undefined : eq(sourceDocuments.sourceId, sourceId))
      .groupBy(sourceDocuments.sourceId, passages.status)
  }

  public async create(input: ContentSourceInput): Promise<ContentSource> {
    const [row] = await this._db
      .insert(contentSources)
      .values({ ...buildColumnValues(input), fetchType: input.fetchType })
      .returning()
    return this._toDomain(row)
  }

  public async findAll(): Promise<ContentSource[]> {
    const rows = await this._db.select().from(contentSources).orderBy(asc(contentSources.id))
    return rows.map((row) => this._toDomain(row))
  }

  public async findById(id: number): Promise<ContentSource | null> {
    const [row] = await this._db.select().from(contentSources).where(eq(contentSources.id, id))
    return row ? this._toDomain(row) : null
  }

  public async findByRepository(repository: string): Promise<ContentSource | null> {
    const [row] = await this._db.select().from(contentSources).where(eq(contentSources.repository, repository))
    return row ? this._toDomain(row) : null
  }

  public async findBySiteUrl(siteUrl: string): Promise<ContentSource | null> {
    const [row] = await this._db.select().from(contentSources).where(eq(contentSources.siteUrl, siteUrl))
    return row ? this._toDomain(row) : null
  }

  public async findFailedPages(sourceId: number): Promise<FailedPage[]> {
    const rows = await this._db
      .select({ httpStatus: sourceDocuments.httpStatus, path: sourceDocuments.path })
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.sourceId, sourceId), gte(sourceDocuments.httpStatus, FAILED_HTTP_STATUS)))
      .orderBy(asc(sourceDocuments.path))
    return rows.map(({ httpStatus, path }) => {
      /**
       * WHERE で http_status >= 400 に絞っているので NULL は来ない
       */
      if (httpStatus === null) throw new Error(`Unexpected null http_status: sourceId=${sourceId}, path=${path}`)
      return { httpStatus, path }
    })
  }

  /**
   * 対象が無いときは Prisma 実装（P2025）と同じく throw する
   */
  public async update(
    id: number,
    input: ContentSourceInput,
    options: { shouldResetCollectedCommit: boolean },
  ): Promise<ContentSource> {
    const [row] = await this._db
      .update(contentSources)
      .set({
        ...buildColumnValues(input),
        ...(options.shouldResetCollectedCommit ? { lastCollectedCommitSha: null } : {}),
      })
      .where(and(eq(contentSources.id, id), eq(contentSources.fetchType, input.fetchType)))
      .returning()
    if (!row) throw new Error(`Content source not found: id=${id}, fetchType=${input.fetchType}`)
    return this._toDomain(row)
  }

  /**
   * Drizzleの型 → ドメインの型に変換。取得方法ごとの必須列は CHECK 制約で保証しているが、念のため検証する
   */
  private _toDomain(row: ContentSourceRow): ContentSource {
    const base = {
      id: row.id,
      excludeGlobs: row.excludeGlobs,
      includeGlobs: row.includeGlobs,
      isEnabled: row.isEnabled,
      kind: row.kind,
      lastCollectedAt: row.lastCollectedAt,
      licenseSpdx: row.licenseSpdx,
      licenseUrl: row.licenseUrl,
      name: row.name,
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    if (row.fetchType === "github_repository") {
      if (row.repository === null || row.branch === null) {
        throw new Error(`Invalid github_repository source: id=${row.id}`)
      }
      return {
        ...base,
        branch: row.branch,
        fetchType: row.fetchType,
        lastCollectedCommitSha: row.lastCollectedCommitSha,
        publicUrlStripPrefix: row.publicUrlStripPrefix,
        publicUrlTemplate: row.publicUrlTemplate,
        repository: row.repository,
      }
    }
    if (row.siteUrl === null) throw new Error(`Invalid website source: id=${row.id}`)
    return {
      ...base,
      contentSelector: row.contentSelector,
      excludeSelectors: row.excludeSelectors,
      fetchType: row.fetchType,
      sitemapUrl: row.sitemapUrl,
      siteUrl: row.siteUrl,
      startUrl: row.startUrl,
    }
  }
}
