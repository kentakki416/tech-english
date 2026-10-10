import { asc, contentSources, DrizzleClient, eq, sql } from "@repo/db"
import type { ContentSource } from "@repo/domain"

import type { ContentSourceRepository } from "../content-source-repository"

/**
 * Drizzleの型
 */
type ContentSourceRow = typeof contentSources.$inferSelect

/**
 * Drizzle 実装の ContentSourceRepository
 */
export class DrizzleContentSourceRepository implements ContentSourceRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findById(id: number): Promise<ContentSource | null> {
    const [row] = await this._db.select().from(contentSources).where(eq(contentSources.id, id))
    return row ? this._toDomain(row) : null
  }

  public async findEnabled(): Promise<ContentSource[]> {
    const rows = await this._db
      .select()
      .from(contentSources)
      .where(eq(contentSources.isEnabled, true))
      .orderBy(sql`${contentSources.lastCollectedAt} ASC NULLS FIRST`, asc(contentSources.id))
    return rows.map((row) => this._toDomain(row))
  }

  public async markCollected(
    id: number,
    input: { lastCollectedAt: Date; lastCollectedCommitSha?: string },
  ): Promise<void> {
    await this._db
      .update(contentSources)
      .set({
        lastCollectedAt: input.lastCollectedAt,
        ...(input.lastCollectedCommitSha === undefined ? {} : { lastCollectedCommitSha: input.lastCollectedCommitSha }),
      })
      .where(eq(contentSources.id, id))
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
