import { and, asc, DrizzleClient, eq, gt, inArray, lte, or, readingAttempts, sql } from "@repo/db"
import type { ReadingAttempt } from "@repo/domain"

import type { CreateReadingAttemptInput, PassageAttemptSummary, ReadingAttemptRepository } from "../reading-attempt-repository"

/**
 * Drizzleの型
 */
type ReadingAttemptRow = typeof readingAttempts.$inferSelect

/**
 * Drizzleの型 → ドメインの型
 */
const convertReadingAttemptRowToDomain = (row: ReadingAttemptRow): ReadingAttempt => ({
  id: row.id,
  correctCount: row.correctCount,
  elapsedSeconds: row.elapsedSeconds,
  isOvertime: row.isOvertime,
  passageId: row.passageId,
  questionCount: row.questionCount,
  startedAt: row.startedAt,
  status: row.status,
  studyDate: row.studyDate,
  submittedAt: row.submittedAt,
  timeLimitSeconds: row.timeLimitSeconds,
  translatedBlockCount: row.translatedBlockCount,
  userId: row.userId,
  wordLookupCount: row.wordLookupCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * 期限内の挑戦中の条件（日時は列の型で変換させるため、生の SQL に Date を埋め込まない）
 */
const buildAliveInProgressCondition = (aliveSince: Date) =>
  and(eq(readingAttempts.status, "in_progress"), gt(readingAttempts.startedAt, aliveSince))

/**
 * Drizzle 実装の ReadingAttemptRepository
 */
export class DrizzleReadingAttemptRepository implements ReadingAttemptRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  /**
   * 部分 unique index（(user_id, passage_id) WHERE status = 'in_progress'）を ON CONFLICT の対象にするため、index と同じ条件を付ける
   */
  public async createInProgress(input: CreateReadingAttemptInput): Promise<ReadingAttempt | null> {
    const [row] = await this._db
      .insert(readingAttempts)
      .values({
        passageId: input.passageId,
        startedAt: input.startedAt,
        status: "in_progress",
        timeLimitSeconds: input.timeLimitSeconds,
        userId: input.userId,
      })
      .onConflictDoNothing({ target: [readingAttempts.userId, readingAttempts.passageId], where: sql`status = 'in_progress'` })
      .returning()
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  public async expireStale(userId: number, aliveSince: Date): Promise<number> {
    const rows = await this._db
      .update(readingAttempts)
      .set({ status: "expired" })
      .where(
        and(
          eq(readingAttempts.userId, userId),
          eq(readingAttempts.status, "in_progress"),
          lte(readingAttempts.startedAt, aliveSince),
        ),
      )
      .returning({ id: readingAttempts.id })
    return rows.length
  }

  public async findAliveInProgress(userId: number, passageId: number, aliveSince: Date): Promise<ReadingAttempt | null> {
    const [row] = await this._db
      .select()
      .from(readingAttempts)
      .where(
        and(
          eq(readingAttempts.userId, userId),
          eq(readingAttempts.passageId, passageId),
          buildAliveInProgressCondition(aliveSince),
        ),
      )
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  public async findByIdForUser(id: number, userId: number): Promise<ReadingAttempt | null> {
    const [row] = await this._db
      .select()
      .from(readingAttempts)
      .where(and(eq(readingAttempts.id, id), eq(readingAttempts.userId, userId)))
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  /**
   * 提出済みと期限内の挑戦中だけを対象に passage_id で GROUP BY し、それぞれを FILTER で集計する
   */
  public async summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]> {
    if (passageIds.length === 0) return []
    const isSubmitted = eq(readingAttempts.status, "submitted")
    const isAliveInProgress = buildAliveInProgressCondition(aliveSince)
    const rows = await this._db
      .select({
        attemptCount: sql<number>`count(*) FILTER (WHERE ${isSubmitted})`.mapWith(Number),
        bestCorrectCount: sql<number | null>`max(${readingAttempts.correctCount}) FILTER (WHERE ${isSubmitted})`.mapWith(Number),
        inProgressAttemptId: sql<number | null>`max(${readingAttempts.id}) FILTER (WHERE ${isAliveInProgress})`.mapWith(Number),
        passageId: readingAttempts.passageId,
      })
      .from(readingAttempts)
      .where(
        and(
          eq(readingAttempts.userId, userId),
          inArray(readingAttempts.passageId, passageIds),
          or(isSubmitted, isAliveInProgress),
        ),
      )
      .groupBy(readingAttempts.passageId)
      .orderBy(asc(readingAttempts.passageId))
    return rows
  }
}
