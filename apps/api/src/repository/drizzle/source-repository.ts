import {
  and,
  asc,
  count,
  DrizzleClient,
  type DrizzleTransaction,
  eq,
  inArray,
  passages,
  sourceDocuments,
  sources,
  sourceTags,
  sql,
  tags,
} from "@repo/db"
import { isAllowedLicense, type Source, type Tag } from "@repo/domain"

import type { ReadOptions } from "../read-options"
import type {
  PassageCountRow,
  SourceCreateInput,
  SourceRepository,
  SourceCreateResult,
  SourceUpdateInput,
  SourceUpdateOptions,
  SourceUpdateResult,
  SourceWithTags,
} from "../source-repository"

import { isForeignKeyViolation, isUniqueViolation } from "./pg-error"
import { convertTagRowToDomain } from "./tag-row"

/**
 * Drizzleの型
 */
type SourceRow = typeof sources.$inferSelect

/**
 * 登録の入力から、取得方法ごとの列と共通の列の値を作る（fetch_type は含めない）
 */
const buildCreateColumnValues = (input: SourceCreateInput) => {
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
      repository: input.repository,
    }
  }
  return {
    ...common,
    contentSelector: input.contentSelector,
    excludeSelectors: input.excludeSelectors,
    siteUrl: input.siteUrl,
  }
}

/**
 * 編集の入力から、書く列の値を作る（fetch_type は含めない）
 */
const buildUpdateColumnValues = (input: SourceUpdateInput) => {
  const common = {
    excludeGlobs: input.excludeGlobs,
    includeGlobs: input.includeGlobs,
    name: input.name,
  }
  if (input.fetchType === "github_repository") {
    return {
      ...common,
      isEnabled: input.isEnabled,
    }
  }
  return {
    ...common,
    contentSelector: input.contentSelector,
    excludeSelectors: input.excludeSelectors,
    licenseSpdx: input.licenseSpdx,
    licenseUrl: input.licenseUrl,
  }
}

/**
 * ソースごとのタグ（lower(name) → id の順）。1 回のクエリで全ソース分を取る（一覧で N+1 にしない）
 */
const findTagsBySourceIds = async (
  db: DrizzleClient["$primary"] | DrizzleTransaction,
  sourceIds: number[],
): Promise<Map<number, Tag[]>> => {
  const tagsBySourceId = new Map<number, Tag[]>(sourceIds.map((sourceId) => [sourceId, []]))
  if (sourceIds.length === 0) return tagsBySourceId
  const rows = await db
    .select({ sourceId: sourceTags.sourceId, tag: tags })
    .from(sourceTags)
    .innerJoin(tags, eq(sourceTags.tagId, tags.id))
    .where(inArray(sourceTags.sourceId, sourceIds))
    .orderBy(sql`lower(${tags.name})`, asc(tags.id))
  for (const row of rows) tagsBySourceId.get(row.sourceId)?.push(convertTagRowToDomain(row.tag))
  return tagsBySourceId
}

/**
 * ソースにタグを付けて返す
 */
const attachTags = async (
  db: DrizzleClient["$primary"] | DrizzleTransaction,
  sourcesWithoutTags: Source[],
): Promise<SourceWithTags[]> => {
  const tagsBySourceId = await findTagsBySourceIds(db, sourcesWithoutTags.map((source) => source.id))
  return sourcesWithoutTags.map((source) => ({ ...source, tags: tagsBySourceId.get(source.id) ?? [] }))
}

/**
 * このソースの source_tags を tagIds に付け替える（消してから入れ直す）。create / update のトランザクションの中で呼ぶ
 */
const replaceSourceTags = async (tx: DrizzleTransaction, sourceId: number, tagIds: number[]): Promise<void> => {
  await tx.delete(sourceTags).where(eq(sourceTags.sourceId, sourceId))
  if (tagIds.length === 0) return
  await tx.insert(sourceTags).values(tagIds.map((tagId) => ({ sourceId, tagId })))
}

/**
 * create の書き込みの失敗を結果に変換する。どちらでもなければ throw し直す。
 * - unique 制約違反は重複の登録（duplicate）とみなせる。sources の unique 制約は主キーと repository / site_url だけで、
 *   source_tags はこのソースの分を消してから入れ直す（tag_ids の重複は api-schema が弾く）ため
 * - 外部キー制約違反はタグが消された（missing_tags）とみなせる。sources は外部キーを持たず、
 *   source_tags の source_id は同じトランザクションで作った・確かめた行を指すので、違反するのは tag_id だけのため
 */
const convertWriteErrorToResult = (error: unknown): SourceCreateResult => {
  if (isUniqueViolation(error)) return { kind: "duplicate" }
  if (isForeignKeyViolation(error)) return { kind: "missing_tags" }
  throw error
}

/**
 * Drizzle実装のソースリポジトリ
 */
export class DrizzleSourceRepository implements SourceRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async countPassagesBySource(sourceId?: number, options?: ReadOptions): Promise<PassageCountRow[]> {
    return this._resolveReader(options)
      .select({ count: count(), sourceId: sourceDocuments.sourceId, status: passages.status })
      .from(passages)
      .innerJoin(sourceDocuments, eq(passages.sourceDocumentId, sourceDocuments.id))
      .where(sourceId === undefined ? undefined : eq(sourceDocuments.sourceId, sourceId))
      .groupBy(sourceDocuments.sourceId, passages.status)
  }

  public async create(input: SourceCreateInput): Promise<SourceCreateResult> {
    try {
      const source = await this._db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sources)
          .values({ ...buildCreateColumnValues(input), fetchType: input.fetchType })
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

  public async findAll(options?: ReadOptions): Promise<SourceWithTags[]> {
    const reader = this._resolveReader(options)
    const rows = await reader.select().from(sources).orderBy(asc(sources.id))
    return attachTags(reader, rows.map((row) => this._toDomain(row)))
  }

  public async findById(id: number, options?: ReadOptions): Promise<SourceWithTags | null> {
    const reader = this._resolveReader(options)
    const [row] = await reader.select().from(sources).where(eq(sources.id, id))
    if (!row) return null
    const [source] = await attachTags(reader, [this._toDomain(row)])
    return source
  }

  public async findByRepository(repository: string): Promise<Source | null> {
    const [row] = await this._db.select().from(sources).where(eq(sources.repository, repository))
    return row ? this._toDomain(row) : null
  }

  public async findBySiteUrl(siteUrl: string): Promise<Source | null> {
    const [row] = await this._db.select().from(sources).where(eq(sources.siteUrl, siteUrl))
    return row ? this._toDomain(row) : null
  }

  /**
   * 対象が無いときは throw する
   */
  public async update(
    id: number,
    input: SourceUpdateInput,
    options: SourceUpdateOptions,
  ): Promise<SourceUpdateResult> {
    try {
      const source = await this._db.transaction(async (tx) => {
        const [updated] = await tx
          .update(sources)
          .set({
            ...buildUpdateColumnValues(input),
            ...(options.shouldResetCollectedCommit ? { lastCollectedCommitSha: null } : {}),
          })
          .where(and(eq(sources.id, id), eq(sources.fetchType, input.fetchType)))
          .returning()
        if (!updated) throw new Error(`Source not found: id=${id}, fetchType=${input.fetchType}`)
        await replaceSourceTags(tx, id, input.tagIds)
        const [saved] = await attachTags(tx, [this._toDomain(updated)])
        return saved
      })
      return { kind: "saved", source }
    } catch (error) {
      /**
       * 外部キー制約違反はタグが消された（理由は convertWriteErrorToResult と同じ）
       */
      if (isForeignKeyViolation(error)) return { kind: "missing_tags" }
      throw error
    }
  }

  /**
   * 読み取りに使う接続。fromPrimary なら read replica を通さずに primary から読む
   */
  private _resolveReader(options?: ReadOptions): DrizzleClient["$primary"] {
    return options?.fromPrimary ? this._db.$primary : this._db
  }

  /**
   * Drizzleの型 → ドメインの型に変換。取得方法ごとの必須列は CHECK 制約で保証しているが、念のため検証する
   */
  private _toDomain(row: SourceRow): Source {
    const base = {
      id: row.id,
      excludeGlobs: row.excludeGlobs,
      includeGlobs: row.includeGlobs,
      isEnabled: row.isEnabled,
      kind: row.kind,
      lastCollectedAt: row.lastCollectedAt,
      licenseUrl: row.licenseUrl,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    if (row.fetchType === "github_repository") {
      const licenseSpdx = row.licenseSpdx
      if (row.repository === null || row.branch === null || !isAllowedLicense(licenseSpdx)) {
        throw new Error(`Invalid github_repository source: id=${row.id}`)
      }
      return {
        ...base,
        branch: row.branch,
        fetchType: row.fetchType,
        lastCollectedCommitSha: row.lastCollectedCommitSha,
        lastCollectedExtractionVersion: row.lastCollectedExtractionVersion,
        licenseSpdx,
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
      licenseSpdx: row.licenseSpdx,
      siteUrl: row.siteUrl,
    }
  }
}
