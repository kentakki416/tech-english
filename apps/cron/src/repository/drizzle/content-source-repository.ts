import { and, asc, contentSources, DrizzleClient, eq, isNull, sql } from "@repo/db"
import type { ContentSource } from "@repo/domain"

import type { ContentSourceRepository, MarkCollectedInput } from "../content-source-repository"

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

  /**
   * commit SHA を渡したときは、WHERE に収集を始めたときの last_collected_commit_sha を足す（null は IS NULL で比べる）
   */
  public async markCollected(id: number, input: MarkCollectedInput): Promise<boolean> {
    const commit = input.lastCollectedCommit
    const isTarget = eq(contentSources.id, id)
    const result = await this._db
      .update(contentSources)
      .set({
        lastCollectedAt: input.lastCollectedAt,
        ...(commit === undefined
          ? {}
          : { lastCollectedCommitSha: commit.nextSha, lastCollectedExtractionVersion: commit.extractionVersion }),
      })
      .where(commit === undefined
        ? isTarget
        : and(
          isTarget,
          commit.expectedSha === null
            ? isNull(contentSources.lastCollectedCommitSha)
            : eq(contentSources.lastCollectedCommitSha, commit.expectedSha),
        ))
    return (result.rowCount ?? 0) > 0
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
        lastCollectedExtractionVersion: row.lastCollectedExtractionVersion,
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
