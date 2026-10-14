import type { PrismaClient } from "@repo/db"
import { isPassageStatus, type PassageBlock, type PassageStatus } from "@repo/domain"

import type {
  ClaimedPassage,
  CreatePassageInput,
  DraftContent,
  DraftGlossaryEntry,
  PassageClaim,
  PassageRepository,
} from "../passage-repository"

/**
 * claimNextCollected の $queryRaw の結果（列名は snake_case のまま）
 */
type ClaimedPassageQueryRow = {
  id: number
  blocks: PassageBlock[]
  generation_attempt_count: number
  generation_started_at: Date
  title: string
  word_count: number
}

/**
 * 用語集の項目を位置で引くキー（createManyAndReturn の順序に頼らず id を引くため）
 */
const buildGlossaryPositionKey = (entry: Pick<DraftGlossaryEntry, "blockIndex" | "endOffset" | "startOffset">): string =>
  `${entry.blockIndex}:${entry.startOffset}:${entry.endOffset}`

/**
 * 取得した実行だけが更新できる条件（generation_started_at を取得のトークンとして使う）。Drizzle 実装の _buildClaimCondition と同じ
 */
const buildClaimWhere = (claim: PassageClaim) => ({
  id: claim.id,
  generationStartedAt: claim.generationStartedAt,
  status: "generating",
})

/**
 * Prisma 実装の PassageRepository
 */
export class PrismaPassageRepository implements PassageRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  /**
   * Prisma には行ロックつきの select が無いので、Drizzle 実装と同じ SQL を $queryRaw で書く。
   * 日時は ISO 文字列を timestamp にキャストして UTC のまま入れる（Prisma のセッションのタイムゾーンに依存させない）
   */
  public async claimNextCollected(input: { now: Date; passageId?: number }): Promise<ClaimedPassage | null> {
    const now = input.now.toISOString()
    const passageId = input.passageId ?? null
    const [row] = await this._prisma.$queryRaw<ClaimedPassageQueryRow[]>`
      UPDATE passages
      SET status = 'generating', generation_started_at = ${now}::timestamp(3), updated_at = ${now}::timestamp(3)
      WHERE id IN (
        SELECT id FROM passages
        WHERE status = 'collected' AND (${passageId}::integer IS NULL OR id = ${passageId}::integer)
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, blocks, generation_attempt_count, generation_started_at, title, word_count
    `
    if (!row) return null
    return {
      id: row.id,
      blocks: row.blocks,
      generationAttemptCount: row.generation_attempt_count,
      generationStartedAt: row.generation_started_at,
      title: row.title,
      wordCount: row.word_count,
    }
  }

  public async countByStatus(status: PassageStatus): Promise<number> {
    return this._prisma.passage.count({ where: { status } })
  }

  public async findStatusById(id: number): Promise<PassageStatus | null> {
    const row = await this._prisma.passage.findUnique({ select: { status: true }, where: { id } })
    return row && isPassageStatus(row.status) ? row.status : null
  }

  /**
   * skipDuplicates（ON CONFLICT DO NOTHING）で挿入し、挿入した件数を返す
   */
  public async insertIgnoringDuplicates(inputs: CreatePassageInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const result = await this._prisma.passage.createMany({
      data: inputs.map((input) => ({
        blocks: input.blocks,
        contentHash: input.contentHash,
        sourceCommitSha: input.sourceCommitSha,
        sourceDocumentId: input.sourceDocumentId,
        sourcePath: input.sourcePath,
        sourceRetrievedAt: input.sourceRetrievedAt,
        title: input.title,
        wordCount: input.wordCount,
      })),
      skipDuplicates: true,
    })
    return result.count
  }

  public async markRejectedByLlm(
    claim: PassageClaim,
    input: { generationModel: string; generationPromptVersion: string; reason: string },
    now: Date,
  ): Promise<boolean> {
    const result = await this._prisma.passage.updateMany({
      data: {
        generatedAt: now,
        generationError: null,
        generationModel: input.generationModel,
        generationPromptVersion: input.generationPromptVersion,
        rejectReason: input.reason,
        status: "rejected",
      },
      where: buildClaimWhere(claim),
    })
    return result.count > 0
  }

  /**
   * 回数の +1 と状態の判定を 1 文で行うため、Drizzle 実装と同じ SQL を $queryRaw で書く（SET の右辺の列は更新前の値）
   */
  public async recordGenerationFailure(
    claim: PassageClaim,
    input: { error: string; maxAttempts: number },
  ): Promise<"collected" | "failed" | null> {
    const now = new Date().toISOString()
    const rows = await this._prisma.$queryRaw<{ status: string }[]>`
      UPDATE passages
      SET
        generation_attempt_count = generation_attempt_count + 1,
        generation_error = ${input.error},
        status = CASE WHEN generation_attempt_count + 1 >= ${input.maxAttempts}::integer THEN 'failed' ELSE 'collected' END,
        updated_at = ${now}::timestamp(3)
      WHERE id = ${claim.id}::integer
        AND status = 'generating'
        AND generation_started_at = ${claim.generationStartedAt.toISOString()}::timestamp(3)
      RETURNING status
    `
    const [row] = rows
    if (!row) return null
    return row.status === "failed" ? "failed" : "collected"
  }

  public async releaseClaim(claim: PassageClaim): Promise<void> {
    await this._prisma.passage.updateMany({ data: { status: "collected" }, where: buildClaimWhere(claim) })
  }

  public async releaseStaleGenerating(startedBefore: Date): Promise<number> {
    const result = await this._prisma.passage.updateMany({
      data: { status: "collected" },
      where: { generationStartedAt: { lt: startedBefore }, status: "generating" },
    })
    return result.count
  }

  /**
   * Drizzle 実装と同じ手順を $transaction の中で行う
   */
  public async saveDraft(claim: PassageClaim, content: DraftContent, now: Date): Promise<boolean> {
    return this._prisma.$transaction(async (tx) => {
      const updated = await tx.passage.updateMany({
        data: {
          attentionReasons: content.attentionReasons,
          blocks: content.blocks,
          difficulty: content.difficulty,
          generatedAt: now,
          generationError: null,
          generationModel: content.generationModel,
          generationPromptVersion: content.generationPromptVersion,
          needsAttention: content.attentionReasons.length > 0,
          rejectReason: null,
          status: "draft",
          timeLimitSeconds: content.timeLimitSeconds,
        },
        where: buildClaimWhere(claim),
      })
      if (updated.count === 0) return false

      await tx.question.deleteMany({ where: { passageId: claim.id } })
      await tx.passageGlossaryEntry.deleteMany({ where: { passageId: claim.id } })

      const glossaryRows = content.glossary.length === 0
        ? []
        : await tx.passageGlossaryEntry.createManyAndReturn({
          data: content.glossary.map((entry) => ({ ...entry, passageId: claim.id })),
          select: { id: true, blockIndex: true, endOffset: true, startOffset: true },
        })
      const glossaryIdByPosition = new Map(glossaryRows.map((row) => [buildGlossaryPositionKey(row), row.id]))

      if (content.questions.length > 0) {
        await tx.question.createMany({
          data: content.questions.map((question) => {
            const target = question.targetGlossaryIndex === null ? undefined : content.glossary[question.targetGlossaryIndex]
            return {
              choices: question.choices,
              correctChoiceIndex: question.correctChoiceIndex,
              evidenceBlockIndex: question.evidenceBlockIndex,
              evidenceQuote: question.evidenceQuote,
              explanationJa: question.explanationJa,
              orderIndex: question.orderIndex,
              passageId: claim.id,
              prompt: question.prompt,
              targetGlossaryEntryId: target ? glossaryIdByPosition.get(buildGlossaryPositionKey(target)) ?? null : null,
              type: question.type,
              verificationChoiceIndex: question.verificationChoiceIndex,
            }
          }),
        })
      }
      return true
    })
  }
}
