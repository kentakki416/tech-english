import type { PrismaClient } from "@repo/db"
import { isPassageStatus } from "@repo/domain"

import type { PassageAudioRepository, PassageAudioWithPassage } from "../passage-audio-repository"
import type { TransactionContext } from "../transaction"

import { convertPassageAudioRowToDomain } from "./passage-audio-row"
import { resolvePrismaClient } from "./transaction-runner"

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
   * updateMany は @updatedAt で updated_at を進め、公開し直しの判定（updated_at < published_at）が崩れるので、$executeRaw で書く
   * （Drizzle 実装と同じく updated_at は今の値のまま）。日時は ISO 文字列を timestamp にキャストして UTC のまま入れる
   */
  public async requestRegeneration(passageId: number, now: Date): Promise<boolean> {
    const count = await this._prisma.$executeRaw`
      UPDATE passage_audios
      SET attempt_count = 0, last_error = NULL, regenerate_requested_at = ${now.toISOString()}::timestamp(3)
      WHERE passage_id = ${passageId}::integer AND status = 'ready'
    `
    return count > 0
  }

  /**
   * 状態の条件付きの updateMany なので、同時に生成タスクや別の再試行が状態を変えていれば 0 件で false になる
   */
  public async resetFailed(passageId: number, tx?: TransactionContext): Promise<boolean> {
    const result = await resolvePrismaClient(this._prisma, tx).passageAudio.updateMany({
      data: { attemptCount: 0, lastError: null, status: "pending" },
      where: { passageId, status: "failed" },
    })
    return result.count > 0
  }
}
