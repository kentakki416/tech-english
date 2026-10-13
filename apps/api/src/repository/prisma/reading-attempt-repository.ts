import { Prisma as PrismaTypes, PrismaClient } from "@repo/db"
import { isAttemptStatus, type ReadingAttempt } from "@repo/domain"

import type { PassageAttemptSummary, ReadingAttemptRepository } from "../reading-attempt-repository"

/**
 * Prismaの型
 */
type ReadingAttemptRow = PrismaTypes.ReadingAttemptGetPayload<{}>

/**
 * Prismaの型 → ドメインの型。status は domain の判定関数で検証し、study_date（UTC の 0 時の Date）は YYYY-MM-DD に戻す
 */
const convertReadingAttemptRowToDomain = (row: ReadingAttemptRow): ReadingAttempt => {
  if (!isAttemptStatus(row.status)) throw new Error(`Invalid attempt status: id=${row.id}, status=${row.status}`)
  return {
    id: row.id,
    correctCount: row.correctCount,
    elapsedSeconds: row.elapsedSeconds,
    isOvertime: row.isOvertime,
    passageId: row.passageId,
    questionCount: row.questionCount,
    startedAt: row.startedAt,
    status: row.status,
    studyDate: row.studyDate === null ? null : row.studyDate.toISOString().slice(0, 10),
    submittedAt: row.submittedAt,
    timeLimitSeconds: row.timeLimitSeconds,
    translatedBlockCount: row.translatedBlockCount,
    userId: row.userId,
    wordLookupCount: row.wordLookupCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Prisma 実装の ReadingAttemptRepository
 */
export class PrismaReadingAttemptRepository implements ReadingAttemptRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findAliveInProgress(userId: number, passageId: number, aliveSince: Date): Promise<ReadingAttempt | null> {
    const row = await this._prisma.readingAttempt.findFirst({
      where: { passageId, startedAt: { gt: aliveSince }, status: "in_progress", userId },
    })
    return row ? convertReadingAttemptRowToDomain(row) : null
  }

  /**
   * Prisma の groupBy は集計ごとに条件を変えられないので、提出済みの集計と期限内の挑戦中を別に読んで passageId で突き合わせる
   */
  public async summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]> {
    if (passageIds.length === 0) return []
    const [submittedGroups, inProgressRows] = await Promise.all([
      this._prisma.readingAttempt.groupBy({
        _count: { _all: true },
        _max: { correctCount: true },
        by: ["passageId"],
        where: { passageId: { in: passageIds }, status: "submitted", userId },
      }),
      this._prisma.readingAttempt.findMany({
        select: { id: true, passageId: true },
        where: { passageId: { in: passageIds }, startedAt: { gt: aliveSince }, status: "in_progress", userId },
      }),
    ])
    const summaries = new Map<number, PassageAttemptSummary>()
    for (const group of submittedGroups) {
      summaries.set(group.passageId, {
        attemptCount: group._count._all,
        bestCorrectCount: group._max.correctCount,
        inProgressAttemptId: null,
        passageId: group.passageId,
      })
    }
    for (const row of inProgressRows) {
      const summary = summaries.get(row.passageId) ?? {
        attemptCount: 0,
        bestCorrectCount: null,
        inProgressAttemptId: null,
        passageId: row.passageId,
      }
      summaries.set(row.passageId, { ...summary, inProgressAttemptId: Math.max(summary.inProgressAttemptId ?? row.id, row.id) })
    }
    return [...summaries.values()].sort((left, right) => left.passageId - right.passageId)
  }
}
