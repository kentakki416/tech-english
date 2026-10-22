import {
  and,
  asc,
  attemptAnswers,
  attemptWordLookups,
  dictionaryEntries,
  DrizzleClient,
  eq,
  gt,
  inArray,
  lte,
  or,
  passageGlossaryEntries,
  readingAttempts,
  sql,
} from "@repo/db"
import type { AttemptAnswer, AttemptWordLookup, ReadingAttempt } from "@repo/domain"

import type { ReadOptions } from "../read-options"
import type {
  CreateReadingAttemptInput,
  InsertAttemptAnswerInput,
  InsertAttemptWordLookupInput,
  PassageAttemptSummary,
  ReadingAttemptRepository,
  SubmitReadingAttemptInput,
  WordLookupWithMeaning,
} from "../reading-attempt-repository"
import type { TransactionContext } from "../transaction"

import { resolveDrizzleClient } from "./transaction-runner"

/**
 * Drizzleの型
 */
type ReadingAttemptRow = typeof readingAttempts.$inferSelect
type AttemptAnswerRow = typeof attemptAnswers.$inferSelect
type AttemptWordLookupRow = typeof attemptWordLookups.$inferSelect

/**
 * Drizzleの型 → ドメインの型
 */
const convertReadingAttemptRowToDomain = (row: ReadingAttemptRow): ReadingAttempt => ({
  id: row.id,
  correctCount: row.correctCount,
  elapsedSeconds: row.elapsedSeconds,
  isOvertime: row.isOvertime,
  listenedBlockCount: row.listenedBlockCount,
  passageId: row.passageId,
  questionCount: row.questionCount,
  startedAt: row.startedAt,
  status: row.status,
  studyDate: row.studyDate,
  submittedAt: row.submittedAt,
  timeLimitSeconds: row.timeLimitSeconds,
  translatedBlockCount: row.translatedBlockCount,
  translatedQuestionCount: row.translatedQuestionCount,
  userId: row.userId,
  wordLookupCount: row.wordLookupCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const convertAttemptAnswerRowToDomain = (row: AttemptAnswerRow): AttemptAnswer => ({
  id: row.id,
  attemptId: row.attemptId,
  isCorrect: row.isCorrect,
  questionId: row.questionId,
  selectedChoiceIndex: row.selectedChoiceIndex,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const convertAttemptWordLookupRowToDomain = (row: AttemptWordLookupRow): AttemptWordLookup => ({
  id: row.id,
  attemptId: row.attemptId,
  glossaryEntryId: row.glossaryEntryId,
  lemma: row.lemma,
  passageId: row.passageId,
  source: row.source,
  surface: row.surface,
  userId: row.userId,
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

  public async findAliveInProgress(
    userId: number,
    passageId: number,
    aliveSince: Date,
    options?: ReadOptions,
  ): Promise<ReadingAttempt | null> {
    const [row] = await this._resolveReader(options)
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

  public async findAnswersByAttemptId(attemptId: number, options?: ReadOptions): Promise<AttemptAnswer[]> {
    const rows = await this._resolveReader(options)
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attemptId))
      .orderBy(asc(attemptAnswers.id))
    return rows.map(convertAttemptAnswerRowToDomain)
  }

  public async findByIdForUser(id: number, userId: number, options?: ReadOptions): Promise<ReadingAttempt | null> {
    const [row] = await this._resolveReader(options)
      .select()
      .from(readingAttempts)
      .where(and(eq(readingAttempts.id, id), eq(readingAttempts.userId, userId)))
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  /**
   * 意味の出どころは source で決まるので、用語集・辞書の join にそれぞれ source の条件を付ける
   */
  public async findWordLookupsWithMeaning(attemptId: number, options?: ReadOptions): Promise<WordLookupWithMeaning[]> {
    const rows = await this._resolveReader(options)
      .select({
        dictionaryMeaningJa: dictionaryEntries.meaningJa,
        glossaryMeaningJa: passageGlossaryEntries.meaningJa,
        lookup: attemptWordLookups,
      })
      .from(attemptWordLookups)
      .leftJoin(
        passageGlossaryEntries,
        and(eq(attemptWordLookups.source, "glossary"), eq(passageGlossaryEntries.id, attemptWordLookups.glossaryEntryId)),
      )
      .leftJoin(
        dictionaryEntries,
        and(eq(attemptWordLookups.source, "dictionary"), eq(dictionaryEntries.headword, attemptWordLookups.lemma)),
      )
      .where(eq(attemptWordLookups.attemptId, attemptId))
      .orderBy(asc(attemptWordLookups.id))
    return rows.map((row) => ({
      ...convertAttemptWordLookupRowToDomain(row.lookup),
      meaningJa: row.lookup.source === "glossary" ? row.glossaryMeaningJa : row.dictionaryMeaningJa,
    }))
  }

  public async insertAnswers(answers: InsertAttemptAnswerInput[], tx?: TransactionContext): Promise<void> {
    if (answers.length === 0) return
    const client = resolveDrizzleClient(this._db, tx)
    await client.insert(attemptAnswers).values(
      answers.map((answer) => ({
        attemptId: answer.attemptId,
        isCorrect: answer.isCorrect,
        questionId: answer.questionId,
        selectedChoiceIndex: answer.selectedChoiceIndex,
      })),
    )
  }

  public async insertWordLookups(lookups: InsertAttemptWordLookupInput[], tx?: TransactionContext): Promise<void> {
    if (lookups.length === 0) return
    const client = resolveDrizzleClient(this._db, tx)
    await client.insert(attemptWordLookups).values(
      lookups.map((lookup) => ({
        attemptId: lookup.attemptId,
        glossaryEntryId: lookup.glossaryEntryId,
        lemma: lookup.lemma,
        passageId: lookup.passageId,
        source: lookup.source,
        surface: lookup.surface,
        userId: lookup.userId,
      })),
    )
  }

  public async markSubmitted(input: SubmitReadingAttemptInput, tx?: TransactionContext): Promise<ReadingAttempt | null> {
    const client = resolveDrizzleClient(this._db, tx)
    const [row] = await client
      .update(readingAttempts)
      .set({
        correctCount: input.correctCount,
        elapsedSeconds: input.elapsedSeconds,
        isOvertime: input.isOvertime,
        listenedBlockCount: input.listenedBlockCount,
        questionCount: input.questionCount,
        status: "submitted",
        studyDate: input.studyDate,
        submittedAt: input.submittedAt,
        translatedBlockCount: input.translatedBlockCount,
        translatedQuestionCount: input.translatedQuestionCount,
        wordLookupCount: input.wordLookupCount,
      })
      .where(and(eq(readingAttempts.id, input.attemptId), eq(readingAttempts.status, "in_progress")))
      .returning()
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

  /**
   * 読み取りに使う接続。fromPrimary なら read replica を通さずに primary から読む
   */
  private _resolveReader(options?: ReadOptions): DrizzleClient["$primary"] {
    return options?.fromPrimary ? this._db.$primary : this._db
  }
}
