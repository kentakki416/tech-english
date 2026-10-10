import { z } from "zod"

import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { type ContentSource, isAllowedLicense, isPassageStatus, isSourceFetchType, isSourceKind } from "@repo/domain"

import type {
  ContentSourceInput,
  ContentSourceRepository,
  FailedPage,
  PassageCountRow,
} from "../content-source-repository"

/**
 * Prismaの型
 */
type ContentSourceRow = PrismaTypes.ContentSourceGetPayload<{}>

/**
 * $queryRaw の結果。COUNT(*) は bigint で返る
 */
type PassageCountQueryRow = { count: bigint; source_id: number; status: string }

/**
 * 取得に失敗したとみなす HTTP ステータスの下限
 */
const FAILED_HTTP_STATUS = 400

/**
 * jsonb の string[] 列
 */
const stringListSchema = z.array(z.string())

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
 * Prisma実装のソースリポジトリ
 */
export class PrismaContentSourceRepository implements ContentSourceRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async countFailedPagesBySource(): Promise<{ count: number; sourceId: number }[]> {
    const groups = await this._prisma.sourceDocument.groupBy({
      _count: { _all: true },
      by: ["sourceId"],
      where: { httpStatus: { gte: FAILED_HTTP_STATUS } },
    })
    return groups.map((group) => ({ count: group._count._all, sourceId: group.sourceId }))
  }

  /**
   * Prisma の groupBy は関連先（source_documents）の列でまとめられないため、Drizzle 実装と同じ SQL を書く
   */
  public async countPassagesBySource(sourceId?: number): Promise<PassageCountRow[]> {
    const rows = sourceId === undefined
      ? await this._prisma.$queryRaw<PassageCountQueryRow[]>`
          SELECT source_documents.source_id, passages.status, COUNT(*) AS count
          FROM passages
          INNER JOIN source_documents ON passages.source_document_id = source_documents.id
          GROUP BY source_documents.source_id, passages.status
        `
      : await this._prisma.$queryRaw<PassageCountQueryRow[]>`
          SELECT source_documents.source_id, passages.status, COUNT(*) AS count
          FROM passages
          INNER JOIN source_documents ON passages.source_document_id = source_documents.id
          WHERE source_documents.source_id = ${sourceId}
          GROUP BY source_documents.source_id, passages.status
        `
    return rows.map((row) => {
      if (!isPassageStatus(row.status)) throw new Error(`Invalid passage status: ${row.status}`)
      return { count: Number(row.count), sourceId: row.source_id, status: row.status }
    })
  }

  public async create(input: ContentSourceInput): Promise<ContentSource> {
    const row = await this._prisma.contentSource.create({
      data: { ...buildColumnValues(input), fetchType: input.fetchType },
    })
    return this._toDomain(row)
  }

  public async findAll(): Promise<ContentSource[]> {
    const rows = await this._prisma.contentSource.findMany({ orderBy: { id: "asc" } })
    return rows.map((row) => this._toDomain(row))
  }

  public async findById(id: number): Promise<ContentSource | null> {
    const row = await this._prisma.contentSource.findUnique({ where: { id } })
    return row ? this._toDomain(row) : null
  }

  public async findByRepository(repository: string): Promise<ContentSource | null> {
    const row = await this._prisma.contentSource.findUnique({ where: { repository } })
    return row ? this._toDomain(row) : null
  }

  public async findBySiteUrl(siteUrl: string): Promise<ContentSource | null> {
    const row = await this._prisma.contentSource.findUnique({ where: { siteUrl } })
    return row ? this._toDomain(row) : null
  }

  public async findFailedPages(sourceId: number): Promise<FailedPage[]> {
    const rows = await this._prisma.sourceDocument.findMany({
      orderBy: { path: "asc" },
      select: { httpStatus: true, path: true },
      where: { httpStatus: { gte: FAILED_HTTP_STATUS }, sourceId },
    })
    return rows.map(({ httpStatus, path }) => {
      /**
       * WHERE で http_status >= 400 に絞っているので NULL は来ない
       */
      if (httpStatus === null) throw new Error(`Unexpected null http_status: sourceId=${sourceId}, path=${path}`)
      return { httpStatus, path }
    })
  }

  /**
   * 対象が無い（id が無い・取得方法が違う）ときは P2025 で throw する
   */
  public async update(
    id: number,
    input: ContentSourceInput,
    options: { shouldResetCollectedCommit: boolean },
  ): Promise<ContentSource> {
    const row = await this._prisma.contentSource.update({
      data: {
        ...buildColumnValues(input),
        ...(options.shouldResetCollectedCommit ? { lastCollectedCommitSha: null } : {}),
      },
      where: { fetchType: input.fetchType, id },
    })
    return this._toDomain(row)
  }

  /**
   * Prismaの型 → ドメインの型に変換。
   * Prisma は CHECK 制約の値の集合を型に持たないので、domain の判定関数で検証する。jsonb は配列に戻す
   */
  private _toDomain(row: ContentSourceRow): ContentSource {
    if (!isSourceKind(row.kind)) throw new Error(`Invalid source kind: id=${row.id}, kind=${row.kind}`)
    if (!isAllowedLicense(row.licenseSpdx)) {
      throw new Error(`Invalid license: id=${row.id}, licenseSpdx=${row.licenseSpdx}`)
    }
    if (!isSourceFetchType(row.fetchType)) {
      throw new Error(`Invalid fetch type: id=${row.id}, fetchType=${row.fetchType}`)
    }
    const base = {
      id: row.id,
      excludeGlobs: stringListSchema.parse(row.excludeGlobs),
      includeGlobs: stringListSchema.parse(row.includeGlobs),
      isEnabled: row.isEnabled,
      kind: row.kind,
      lastCollectedAt: row.lastCollectedAt,
      licenseSpdx: row.licenseSpdx,
      licenseUrl: row.licenseUrl,
      name: row.name,
      tags: stringListSchema.parse(row.tags),
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
      excludeSelectors: stringListSchema.parse(row.excludeSelectors),
      fetchType: row.fetchType,
      sitemapUrl: row.sitemapUrl,
      siteUrl: row.siteUrl,
      startUrl: row.startUrl,
    }
  }
}
