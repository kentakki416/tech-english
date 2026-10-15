import {
  and,
  asc,
  contentSources,
  contentSourceTags,
  count,
  DrizzleClient,
  type DrizzleTransaction,
  eq,
  gte,
  inArray,
  passages,
  sourceDocuments,
  sql,
  tags,
} from "@repo/db"
import type { ContentSource, Tag } from "@repo/domain"

import type {
  ContentSourceInput,
  ContentSourceRepository,
  ContentSourceSaveResult,
  ContentSourceUpdateOptions,
  ContentSourceWithTags,
  FailedPage,
  PassageCountRow,
} from "../content-source-repository"

import { isForeignKeyViolation, isUniqueViolation } from "./pg-error"
import { convertTagRowToDomain } from "./tag-row"

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
 * ソースごとのタグ（lower(name) → id の順）。1 回のクエリで全ソース分を取る（一覧で N+1 にしない）
 */
const findTagsBySourceIds = async (
  db: DrizzleClient | DrizzleTransaction,
  sourceIds: number[],
): Promise<Map<number, Tag[]>> => {
  const tagsBySourceId = new Map<number, Tag[]>(sourceIds.map((sourceId) => [sourceId, []]))
  if (sourceIds.length === 0) return tagsBySourceId
  const rows = await db
    .select({ sourceId: contentSourceTags.contentSourceId, tag: tags })
    .from(contentSourceTags)
    .innerJoin(tags, eq(contentSourceTags.tagId, tags.id))
    .where(inArray(contentSourceTags.contentSourceId, sourceIds))
    .orderBy(sql`lower(${tags.name})`, asc(tags.id))
  for (const row of rows) tagsBySourceId.get(row.sourceId)?.push(convertTagRowToDomain(row.tag))
  return tagsBySourceId
}

/**
 * ソースにタグを付けて返す
 */
const attachTags = async (
  db: DrizzleClient | DrizzleTransaction,
  sources: ContentSource[],
): Promise<ContentSourceWithTags[]> => {
  const tagsBySourceId = await findTagsBySourceIds(db, sources.map((source) => source.id))
  return sources.map((source) => ({ ...source, tags: tagsBySourceId.get(source.id) ?? [] }))
}

/**
 * このソースの content_source_tags を tagIds に付け替える（消してから入れ直す）。create / update のトランザクションの中で呼ぶ
 */
const replaceSourceTags = async (tx: DrizzleTransaction, sourceId: number, tagIds: number[]): Promise<void> => {
  await tx.delete(contentSourceTags).where(eq(contentSourceTags.contentSourceId, sourceId))
  if (tagIds.length === 0) return
  await tx.insert(contentSourceTags).values(tagIds.map((tagId) => ({ contentSourceId: sourceId, tagId })))
}

/**
 * create / update の書き込みの失敗を結果に変換する。どちらでもなければ throw し直す。
 * - unique 制約違反は重複の登録（duplicate）とみなせる。content_sources の unique 制約は主キーと repository / site_url だけで、
 *   content_source_tags はこのソースの分を消してから入れ直す（tag_ids の重複は api-schema が弾く）ため
 * - 外部キー制約違反はタグが消された（missing_tags）とみなせる。content_sources は外部キーを持たず、
 *   content_source_tags の content_source_id は同じトランザクションで作った・確かめた行を指すので、違反するのは tag_id だけのため
 */
const convertWriteErrorToResult = (error: unknown): ContentSourceSaveResult => {
  if (isUniqueViolation(error)) return { kind: "duplicate" }
  if (isForeignKeyViolation(error)) return { kind: "missing_tags" }
  throw error
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

  public async create(input: ContentSourceInput): Promise<ContentSourceSaveResult> {
    try {
      const source = await this._db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contentSources)
          .values({ ...buildColumnValues(input), fetchType: input.fetchType })
          .returning()
        await replaceSourceTags(tx, row.id, input.tagIds)
        const [created] = await attachTags(tx, [this._toDomain(row)])
        return created
      })
      return { kind: "saved", source }
    } catch (error) {
      return convertWriteErrorToResult(error)
    }
  }

  public async findAll(): Promise<ContentSourceWithTags[]> {
    const rows = await this._db.select().from(contentSources).orderBy(asc(contentSources.id))
    return attachTags(this._db, rows.map((row) => this._toDomain(row)))
  }

  public async findById(id: number): Promise<ContentSourceWithTags | null> {
    const [row] = await this._db.select().from(contentSources).where(eq(contentSources.id, id))
    if (!row) return null
    const [source] = await attachTags(this._db, [this._toDomain(row)])
    return source
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

  public async hasSourceDocuments(sourceId: number): Promise<boolean> {
    const rows = await this._db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.sourceId, sourceId))
      .limit(1)
    return rows.length > 0
  }

  /**
   * 対象が無いときは throw する
   */
  public async update(
    id: number,
    input: ContentSourceInput,
    options: ContentSourceUpdateOptions,
  ): Promise<ContentSourceSaveResult> {
    try {
      const source = await this._db.transaction(async (tx) => {
        const [updated] = await tx
          .update(contentSources)
          .set({
            ...buildColumnValues(input),
            ...(options.shouldResetCollectedCommit ? { lastCollectedCommitSha: null } : {}),
          })
          .where(and(eq(contentSources.id, id), eq(contentSources.fetchType, input.fetchType)))
          .returning()
        if (!updated) throw new Error(`Content source not found: id=${id}, fetchType=${input.fetchType}`)
        if (options.shouldResetDocumentCache) {
          await tx
            .update(sourceDocuments)
            .set({ contentHash: null, etag: null, lastModified: null })
            .where(eq(sourceDocuments.sourceId, id))
        }
        await replaceSourceTags(tx, id, input.tagIds)
        const [saved] = await attachTags(tx, [this._toDomain(updated)])
        return saved
      })
      return { kind: "saved", source }
    } catch (error) {
      return convertWriteErrorToResult(error)
    }
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
