import type { PrismaClient } from "@repo/db"

import type { CreatePassageInput, PassageRepository } from "../passage-repository"

/**
 * Prisma 実装の PassageRepository
 */
export class PrismaPassageRepository implements PassageRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
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
}
