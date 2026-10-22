import type { AttemptAnswer, AttemptWordLookup, ReadingAttempt } from "@repo/domain"

import type { ReadOptions } from "./read-options"
import type { TransactionContext } from "./transaction"

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
 * 提出で挑戦に書く値（採点結果・時間・アシストの使用）
 */
export type SubmitReadingAttemptInput = {
  attemptId: number
  correctCount: number
  elapsedSeconds: number
  isOvertime: boolean
  /**
   * 読み上げを聞いた段落の数（code 以外のブロック数で切り詰めた値）
   */
  listenedBlockCount: number
  questionCount: number
  /**
   * 提出時のユーザーのタイムゾーンでの日付（YYYY-MM-DD）
   */
  studyDate: string
  submittedAt: Date
  translatedBlockCount: number
  /**
   * 和訳を出した設問の数（設問の数で切り詰めた値）
   */
  translatedQuestionCount: number
  wordLookupCount: number
}

/**
 * 保存する回答
 */
export type InsertAttemptAnswerInput = Omit<AttemptAnswer, "createdAt" | "id" | "updatedAt">

/**
 * 保存する調べた単語
 */
export type InsertAttemptWordLookupInput = Omit<AttemptWordLookup, "createdAt" | "id" | "updatedAt">

/**
 * 調べた単語と、その意味（用語集は文脈での意味、辞書は辞書の意味。用語集が消された・辞書に無いものは null）
 */
export type WordLookupWithMeaning = AttemptWordLookup & { meaningJa: string | null }

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
  findAliveInProgress(userId: number, passageId: number, aliveSince: Date, options?: ReadOptions): Promise<ReadingAttempt | null>
  /**
   * 挑戦の回答を id の昇順で返す
   */
  findAnswersByAttemptId(attemptId: number, options?: ReadOptions): Promise<AttemptAnswer[]>
  /**
   * そのユーザーの挑戦（状態を問わない）。他人の挑戦・存在しない ID は null（存在を明かさない）
   */
  findByIdForUser(id: number, userId: number, options?: ReadOptions): Promise<ReadingAttempt | null>
  /**
   * 挑戦の調べた単語を id の昇順（調べた順）で返す。意味は、glossary は passage_glossary_entries.meaning_ja、
   * dictionary は dictionary_entries（headword = lemma）を left join して引く
   */
  findWordLookupsWithMeaning(attemptId: number, options?: ReadOptions): Promise<WordLookupWithMeaning[]>
  /**
   * 回答をまとめて保存する。空配列なら何もしない
   */
  insertAnswers(answers: InsertAttemptAnswerInput[], tx?: TransactionContext): Promise<void>
  /**
   * 調べた単語をまとめて保存する。空配列なら何もしない
   */
  insertWordLookups(lookups: InsertAttemptWordLookupInput[], tx?: TransactionContext): Promise<void>
  /**
   * status = 'in_progress' のときだけ submitted にして採点結果と時間を書く（UPDATE ... WHERE status = 'in_progress' RETURNING）。
   * 同時に提出された・期限切れにされたなどで更新できなければ null
   */
  markSubmitted(input: SubmitReadingAttemptInput, tx?: TransactionContext): Promise<ReadingAttempt | null>
  /**
   * 問題ごとの挑戦の集計を passageId の昇順で返す。提出済みも期限内の挑戦中も無い問題は返さない
   */
  summarizeByPassageIds(userId: number, passageIds: number[], aliveSince: Date): Promise<PassageAttemptSummary[]>
}
