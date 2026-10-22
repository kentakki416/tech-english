import { and, desc, DrizzleClient, eq, lt, or, sourceCollectionRuns, sql } from "@repo/db"
import type { SourceCollectionRun } from "@repo/domain"

import type { ReadOptions } from "../read-options"
import type { CreateSourceCollectionRunResult, SourceCollectionRunRepository } from "../source-collection-run-repository"

import { isUniqueViolation } from "./pg-error"

/**
 * Drizzleの型
 */
type SourceCollectionRunRow = typeof sourceCollectionRuns.$inferSelect

/**
 * Drizzle実装の収集の実行の記録のリポジトリ
 */
export class DrizzleSourceCollectionRunRepository implements SourceCollectionRunRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async create(sourceId: number): Promise<CreateSourceCollectionRunResult> {
    try {
      const [row] = await this._db.insert(sourceCollectionRuns).values({ sourceId, status: "queued" }).returning()
      return { kind: "created", run: this._toDomain(row) }
    } catch (error) {
      /**
       * このテーブルの unique は主キーと、収集中の記録の部分 unique index だけなので、違反はそのソースが収集中であることを表す
       */
      if (isUniqueViolation(error)) return { kind: "active_exists" }
      throw error
    }
  }

  public async failTimedOut(input: { error: string; now: Date; sourceId: number; staleBefore: Date }): Promise<number> {
    const rows = await this._db
      .update(sourceCollectionRuns)
      .set({ error: input.error, finishedAt: input.now, status: "failed" })
      .where(
        and(
          eq(sourceCollectionRuns.sourceId, input.sourceId),
          or(
            and(eq(sourceCollectionRuns.status, "queued"), lt(sourceCollectionRuns.createdAt, input.staleBefore)),
            and(eq(sourceCollectionRuns.status, "running"), lt(sourceCollectionRuns.startedAt, input.staleBefore)),
          ),
        ),
      )
      .returning({ id: sourceCollectionRuns.id })
    return rows.length
  }

  public async findLatestBySourceId(sourceId: number, options?: ReadOptions): Promise<SourceCollectionRun | null> {
    const reader = options?.fromPrimary ? this._db.$primary : this._db
    const [row] = await reader
      .select()
      .from(sourceCollectionRuns)
      .where(eq(sourceCollectionRuns.sourceId, sourceId))
      .orderBy(desc(sourceCollectionRuns.id))
      .limit(1)
    return row ? this._toDomain(row) : null
  }

  public async markQueuedAsFailed(input: { error: string; id: number }): Promise<void> {
    await this._db
      .update(sourceCollectionRuns)
      .set({ error: input.error, finishedAt: sql`now()`, status: "failed" })
      .where(and(eq(sourceCollectionRuns.id, input.id), eq(sourceCollectionRuns.status, "queued")))
  }

  /**
   * Drizzleの型 → ドメインの型に変換
   */
  private _toDomain(row: SourceCollectionRunRow): SourceCollectionRun {
    return {
      id: row.id,
      createdPassageCount: row.createdPassageCount,
      error: row.error,
      fetchedDocumentCount: row.fetchedDocumentCount,
      finishedAt: row.finishedAt,
      sourceId: row.sourceId,
      startedAt: row.startedAt,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
