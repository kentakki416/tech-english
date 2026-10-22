import { and, DrizzleClient, eq, inArray, sourceCollectionRuns } from "@repo/db"

import type {
  SourceCollectionOutcome,
  SourceCollectionRunClaim,
  SourceCollectionRunRepository,
} from "../source-collection-run-repository"

/**
 * Drizzle 実装の SourceCollectionRunRepository
 */
export class DrizzleSourceCollectionRunRepository implements SourceCollectionRunRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async claim(runId: number, now: Date): Promise<SourceCollectionRunClaim | null> {
    const [row] = await this._db
      .update(sourceCollectionRuns)
      .set({ startedAt: now, status: "running" })
      .where(and(eq(sourceCollectionRuns.id, runId), inArray(sourceCollectionRuns.status, ["queued", "running"])))
      .returning({ sourceId: sourceCollectionRuns.sourceId, startedAt: sourceCollectionRuns.startedAt })
    if (!row || row.startedAt === null) return null
    return { runId, sourceId: row.sourceId, startedAt: row.startedAt }
  }

  public async finish(claim: SourceCollectionRunClaim, outcome: SourceCollectionOutcome, now: Date): Promise<boolean> {
    const values = outcome.status === "failed"
      ? { error: outcome.error, finishedAt: now, status: outcome.status }
      : {
        createdPassageCount: outcome.createdPassageCount,
        fetchedDocumentCount: outcome.fetchedDocumentCount,
        finishedAt: now,
        status: outcome.status,
      }
    const rows = await this._db
      .update(sourceCollectionRuns)
      .set(values)
      .where(and(
        eq(sourceCollectionRuns.id, claim.runId),
        eq(sourceCollectionRuns.status, "running"),
        eq(sourceCollectionRuns.startedAt, claim.startedAt),
      ))
      .returning({ id: sourceCollectionRuns.id })
    return rows.length > 0
  }
}
