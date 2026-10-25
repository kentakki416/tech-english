import { and, DrizzleClient, eq, isNull, sources } from "@repo/db"
import { isAllowedLicense, type Source } from "@repo/domain"

import type { MarkCollectedInput, SourceRepository } from "../source-repository"

/**
 * Drizzleの型
 */
type SourceRow = typeof sources.$inferSelect

/**
 * Drizzle 実装の SourceRepository
 */
export class DrizzleSourceRepository implements SourceRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findById(id: number): Promise<Source | null> {
    const [row] = await this._db.select().from(sources).where(eq(sources.id, id))
    return row ? this._toDomain(row) : null
  }

  /**
   * commit SHA を渡したときは、WHERE に収集を始めたときの last_collected_commit_sha を足す（null は IS NULL で比べる）
   */
  public async markCollected(id: number, input: MarkCollectedInput): Promise<boolean> {
    const commit = input.lastCollectedCommit
    const isTarget = eq(sources.id, id)
    const result = await this._db
      .update(sources)
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
            ? isNull(sources.lastCollectedCommitSha)
            : eq(sources.lastCollectedCommitSha, commit.expectedSha),
        ))
    return (result.rowCount ?? 0) > 0
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
