import type { AdminPassageStatsSort, PassageDifficulty, PassageStatus, QuestionType } from "@repo/domain"

/**
 * 期間。from が null なら最初から、to は今（どちらも UTC の時刻）
 */
export type StatsTimeRange = { from: Date | null; to: Date }

/**
 * 解いた（提出した）挑戦の合計。比率は Service で求める
 */
export type AttemptTotals = {
  correctCount: number
  elapsedSecondsSum: number
  listenedAttempts: number
  lookedUpAttempts: number
  overtimeAttempts: number
  questionCount: number
  solvedAttempts: number
  solvedUsers: number
  translatedAttempts: number
  /**
   * 設問の和訳を 1 つ以上出した挑戦の数
   */
  translatedQuestionAttempts: number
}

/**
 * 全体の利用状況の数。totalUsers だけは期間に関係しない今の総数
 */
export type OverviewTotals = AttemptTotals & {
  activeUsers: number
  newUsers: number
  totalUsers: number
}

/**
 * 推移の 1 点。date は日本時間の日（週ごとなら、その週の月曜）
 */
export type SeriesPoint = {
  activeUsers: number
  date: string
  newUsers: number
  solvedAttempts: number
}

/**
 * 問題ごとの成績の 1 行（解かれていなければ合計はすべて 0）
 */
export type PassageStatsRow = AttemptTotals & {
  id: number
  difficulty: PassageDifficulty | null
  publishedAt: Date | null
  source: { id: number; name: string }
  status: PassageStatus
  timeLimitSeconds: number | null
  title: string
}

/**
 * 設問 1 つの、期間内の提出済みの挑戦での解答の集計
 */
export type QuestionStatsRow = {
  id: number
  /**
   * この設問の解答の数（未回答を含む）
   */
  answerCount: number
  /**
   * choices と同じ長さ。その選択肢を選んだ解答の数
   */
  choiceCounts: number[]
  choices: string[]
  correctChoiceIndex: number
  /**
   * 提出したときに正解だった解答の数（後から正解を直しても変わらない）
   */
  correctCount: number
  orderIndex: number
  prompt: string
  type: QuestionType
  unansweredCount: number
}

export type FindPassageStatsQuery = StatsTimeRange & {
  limit: number
  offset: number
  order: "asc" | "desc"
  /**
   * タイトルの部分一致
   */
  q?: string
  sort: AdminPassageStatsSort
}

/**
 * admin のダッシュボードの集計（読み取りだけ）。Postgres の学習の記録をその場で集計する（admin-dashboard README「集計の方法」）
 */
export interface AdminStatsRepository {
  /**
   * 最初のユーザーの登録日時（全期間の推移の始まり）。ユーザーがいなければ null
   */
  findFirstUserCreatedAt(): Promise<Date | null>
  /**
   * 日本時間の日（週）ごとの推移。fromDate〜toDate のすべての日（週）を 0 埋めで返す。週ごとのときは fromDate・toDate を月曜にそろえて渡す
   */
  findOverviewSeries(range: { bucket: "day" | "week"; fromDate: string; toDate: string }): Promise<SeriesPoint[]>
  /**
   * 公開中の問題と、期間内に解かれた問題の成績。並べ替え・絞り込み・ページ分けまでする
   */
  findPassageStats(query: FindPassageStatsQuery): Promise<{ items: PassageStatsRow[]; total: number }>
  /**
   * 1 つの問題の成績（状態を問わない）。問題が無ければ null
   */
  findPassageStatsById(passageId: number, range: StatsTimeRange): Promise<PassageStatsRow | null>
  /**
   * 1 つの問題の設問ごとの集計（order_index の順。解かれていない設問も返す）
   */
  findQuestionStats(passageId: number, range: StatsTimeRange): Promise<QuestionStatsRow[]>
  summarizeOverview(range: StatsTimeRange): Promise<OverviewTotals>
}
