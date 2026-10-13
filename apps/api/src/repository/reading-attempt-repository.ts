import type { ReadingAttempt } from "@repo/domain"

/**
 * 1 つの問題についての、あるユーザーの挑戦の集計
 */
export type PassageAttemptSummary = {
  /**
   * 提出済みの挑戦の数
   */
  attemptCount: number
  /**
   * 提出済みの挑戦の最高正答数。提出済みが無ければ null
   */
  bestCorrectCount: number | null
  /**
   * 期限内の挑戦中の ID。無ければ null
   */
  inProgressAttemptId: number | null
  passageId: number
}

/**
 * 挑戦中の挑戦を作るときの入力
 */
export type CreateReadingAttemptInput = {
  passageId: number
  startedAt: Date
  /**
   * 開始時点の問題の制限時間
   */
  timeLimitSeconds: number
  userId: number
}

/**
 * 挑戦（reading_attempts）のリポジトリ。期限切れ（開始から 24 時間）の判定は aliveSince で受け取り、
 * 「started_at > aliveSince の in_progress」だけを期限内として扱う（expired への更新は書き込み API の前に expireStale で行う）
 */
export interface ReadingAttemptRepository {
  /**
   * 挑戦中の挑戦を作る。同じユーザー・同じ問題の in_progress が既にある（部分 unique index に当たる）ときは作らずに null
   */
  createInProgress(input: CreateReadingAttemptInput): Promise<ReadingAttempt | null>
  /**
   * そのユーザーの started_at <= aliveSince の in_progress を expired にし、更新した件数を返す
   */
  expireStale(userId: number, aliveSince: Date): Promise<number>
  /**
   * そのユーザーのその問題の期限内の挑戦中。無ければ null
   */
  findAliveInProgress(userId: number, passageId: number, aliveSince: Date): Promise<ReadingAttempt | null>
  /**
   * そのユーザーの挑戦（状態を問わない）。他人の挑戦・存在しない ID は null（存在を明かさない）
   */
  findByIdForUser(id: number, userId: number): Promise<ReadingAttempt | null>
  /**
   * 問題ごとの挑戦の集計を passageId の昇順で返す。提出済みも期限内の挑戦中も無い問題は返さない
   */
  summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]>
}
