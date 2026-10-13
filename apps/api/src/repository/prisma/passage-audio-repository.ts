import type { PrismaClient } from "@repo/db"
import { isPassageStatus } from "@repo/domain"

import type { PassageAudioRepository, PassageAudioWithPassage } from "../passage-audio-repository"

import { convertPassageAudioRowToDomain } from "./passage-audio-row"

/**
 * Prisma 実装の PassageAudioRepository
 */
export class PrismaPassageAudioRepository implements PassageAudioRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  public async findByPassageId(passageId: number): Promise<PassageAudioWithPassage | null> {
    const passage = await this._prisma.passage.findUnique({
      select: { audio: true, publishedAt: true, status: true },
      where: { id: passageId },
    })
    if (!passage) return null
    /**
     * Prisma は CHECK 制約の値の集合を型に持たないので、domain の判定関数で検証する（未知の値は throw）
     */
    if (!isPassageStatus(passage.status)) throw new Error(`Invalid passage status: id=${passageId}, status=${passage.status}`)
    return {
      audio: passage.audio ? convertPassageAudioRowToDomain(passage.audio) : null,
      passage: { publishedAt: passage.publishedAt, status: passage.status },
    }
  }

  /**
   * 状態の条件付きの updateMany なので、同時に生成タスクや別の再試行が状態を変えていれば 0 件で false になる
   */
  public async resetFailed(passageId: number): Promise<boolean> {
    const result = await this._prisma.passageAudio.updateMany({
      data: { attemptCount: 0, lastError: null, status: "pending" },
      where: { passageId, status: "failed" },
    })
    return result.count > 0
  }
}
