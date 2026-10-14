import type { PrismaClient } from "@repo/db"

import type { AudioSynthesisUsageRepository } from "../audio-synthesis-usage-repository"

/**
 * Prisma 実装の AudioSynthesisUsageRepository
 */
export class PrismaAudioSynthesisUsageRepository implements AudioSynthesisUsageRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async record(input: { characters: number; now: Date; passageId: number }): Promise<void> {
    await this._prisma.audioSynthesisUsage.create({
      data: { characters: input.characters, createdAt: input.now, passageId: input.passageId, updatedAt: input.now },
    })
  }

  /**
   * 直前に書いた記録を数え落とさないよう、$transaction（primary に流れる）の中で読む
   */
  public async sumCharactersSinceFromPrimary(since: Date): Promise<number> {
    const result = await this._prisma.$transaction(async (tx) =>
      tx.audioSynthesisUsage.aggregate({ _sum: { characters: true }, where: { createdAt: { gte: since } } }))
    return result._sum.characters ?? 0
  }
}
