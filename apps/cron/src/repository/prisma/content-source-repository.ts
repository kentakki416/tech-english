import { z } from "zod"

import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { type ContentSource, isAllowedLicense, isSourceFetchType, isSourceKind } from "@repo/domain"

import type { ContentSourceRepository } from "../content-source-repository"

/**
 * Prismaの型
 */
type ContentSourceRow = PrismaTypes.ContentSourceGetPayload<{}>

/**
 * jsonb の string[] 列
 */
const stringListSchema = z.array(z.string())

/**
 * Prisma 実装の ContentSourceRepository
 */
export class PrismaContentSourceRepository implements ContentSourceRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findById(id: number): Promise<ContentSource | null> {
    const row = await this._prisma.contentSource.findUnique({ where: { id } })
    return row ? this._toDomain(row) : null
  }

  public async findEnabled(): Promise<ContentSource[]> {
    const rows = await this._prisma.contentSource.findMany({
      orderBy: [{ lastCollectedAt: { nulls: "first", sort: "asc" } }, { id: "asc" }],
      where: { isEnabled: true },
    })
    return rows.map((row) => this._toDomain(row))
  }

  public async markCollected(
    id: number,
    input: { lastCollectedAt: Date; lastCollectedCommitSha?: string },
  ): Promise<void> {
    await this._prisma.contentSource.update({
      data: {
        lastCollectedAt: input.lastCollectedAt,
        ...(input.lastCollectedCommitSha === undefined ? {} : { lastCollectedCommitSha: input.lastCollectedCommitSha }),
      },
      where: { id },
    })
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
