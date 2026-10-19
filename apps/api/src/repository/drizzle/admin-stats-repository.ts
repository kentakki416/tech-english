import { DrizzleClient, type SQL, sql } from "@repo/db"
import { ADMIN_STATS_TIME_ZONE, type AdminPassageStatsSort, type PassageDifficulty, type PassageStatus, type QuestionType } from "@repo/domain"

import type {
  AdminStatsRepository,
  AttemptTotals,
  FindPassageStatsQuery,
  OverviewTotals,
  PassageStatsRow,
  QuestionStatsRow,
  SeriesPoint,
  StatsTimeRange,
} from "../admin-stats-repository"

import { buildContainsLikePattern } from "./like-pattern"
import { convertInstantToUtcTimestamp, convertUtcTimestampTextToDate } from "./utc-timestamp"

/**
 * column が期間に入る条件（from 以上・to 未満。from が null なら下限なし）
 */
const buildPeriodCondition = (column: SQL, range: StatsTimeRange): SQL =>
  range.from === null
    ? sql`${column} < ${convertInstantToUtcTimestamp(range.to)}`
    : sql`${column} >= ${convertInstantToUtcTimestamp(range.from)} AND ${column} < ${convertInstantToUtcTimestamp(range.to)}`

/**
 * 日本時間の日付（YYYY-MM-DD）の 0 時を、UTC の timestamp without time zone にする
 */
const convertTokyoDateToUtcStart = (date: SQL): SQL =>
  sql`((${date})::timestamp AT TIME ZONE ${ADMIN_STATS_TIME_ZONE}) AT TIME ZONE 'UTC'`

/**
 * UTC で保存している timestamp の列を、日本時間の日（週）の始まりの日付にする（週の date_trunc は月曜始まり）
 */
const truncateToTokyoBucket = (column: SQL, unit: "day" | "week"): SQL =>
  sql`date_trunc(${unit}, (${column} AT TIME ZONE 'UTC') AT TIME ZONE ${ADMIN_STATS_TIME_ZONE})::date`

/**
 * 提出済みの挑戦の合計の列（ra は reading_attempts）。pg の count / sum は bigint・numeric を文字列で返すので、行の型は文字列
 */
const ATTEMPT_TOTAL_COLUMNS = sql`
  count(*) AS solved_attempts,
  count(DISTINCT ra.user_id) AS solved_users,
  coalesce(sum(ra.correct_count), 0) AS correct_count,
  coalesce(sum(ra.question_count), 0) AS question_count,
  coalesce(sum(ra.elapsed_seconds), 0) AS elapsed_seconds_sum,
  count(*) FILTER (WHERE ra.is_overtime) AS overtime_attempts,
  count(*) FILTER (WHERE ra.translated_block_count > 0) AS translated_attempts,
  count(*) FILTER (WHERE ra.translated_question_count > 0) AS translated_question_attempts,
  count(*) FILTER (WHERE ra.word_lookup_count > 0) AS looked_up_attempts,
  count(*) FILTER (WHERE ra.listened_block_count > 0) AS listened_attempts
`

type AttemptTotalsRow = {
  correct_count: string | null
  elapsed_seconds_sum: string | null
  listened_attempts: string | null
  looked_up_attempts: string | null
  overtime_attempts: string | null
  question_count: string | null
  solved_attempts: string | null
  solved_users: string | null
  translated_attempts: string | null
  translated_question_attempts: string | null
}

/**
 * 合計の列を数値にする（問題が解かれていない left join の行は NULL なので 0）
 */
const convertAttemptTotalsRow = (row: AttemptTotalsRow): AttemptTotals => ({
  correctCount: Number(row.correct_count ?? 0),
  elapsedSecondsSum: Number(row.elapsed_seconds_sum ?? 0),
  listenedAttempts: Number(row.listened_attempts ?? 0),
  lookedUpAttempts: Number(row.looked_up_attempts ?? 0),
  overtimeAttempts: Number(row.overtime_attempts ?? 0),
  questionCount: Number(row.question_count ?? 0),
  solvedAttempts: Number(row.solved_attempts ?? 0),
  solvedUsers: Number(row.solved_users ?? 0),
  translatedAttempts: Number(row.translated_attempts ?? 0),
  translatedQuestionAttempts: Number(row.translated_question_attempts ?? 0),
})

type PassageStatsQueryRow = AttemptTotalsRow & {
  id: number
  /**
   * DB の CHECK で 1〜3 か NULL
   */
  difficulty: PassageDifficulty | null
  published_at: string | null
  source_id: number
  source_name: string
  status: PassageStatus
  time_limit_seconds: number | null
  title: string
  total: string
}

/**
 * 問題ごとの成績の並べ替えの式（s は問題ごとに束ねた集計。比率は SQL の中で計算して並べる）
 */
const PASSAGE_STATS_SORT_EXPRESSIONS: Record<AdminPassageStatsSort, SQL> = {
  average_elapsed_seconds: sql`s.elapsed_seconds_sum::float / NULLIF(s.solved_attempts, 0)`,
  correct_rate: sql`s.correct_count::float / NULLIF(s.question_count, 0)`,
  overtime_rate: sql`s.overtime_attempts::float / NULLIF(s.solved_attempts, 0)`,
  published_at: sql`p.published_at`,
  solved_attempts: sql`coalesce(s.solved_attempts, 0)`,
  solved_users: sql`coalesce(s.solved_users, 0)`,
}

const convertPassageStatsRow = (row: PassageStatsQueryRow): PassageStatsRow => ({
  id: row.id,
  ...convertAttemptTotalsRow(row),
  difficulty: row.difficulty,
  publishedAt: row.published_at === null ? null : convertUtcTimestampTextToDate(row.published_at),
  source: { id: row.source_id, name: row.source_name },
  status: row.status,
  timeLimitSeconds: row.time_limit_seconds,
  title: row.title,
})

/**
 * Drizzle 実装の AdminStatsRepository。集計は生の SQL で書く（ra / p / s などの別名を使う）
 */
export class DrizzleAdminStatsRepository implements AdminStatsRepository {
  private _db: DrizzleClient

  constructor(db: DrizzleClient) {
    this._db = db
  }

  public async findFirstUserCreatedAt(): Promise<Date | null> {
    const result = await this._db.execute<{ first_created_at: string | null }>(sql`SELECT min(created_at)::text AS first_created_at FROM users`)
    const value = result.rows[0]?.first_created_at ?? null
    return value === null ? null : convertUtcTimestampTextToDate(value)
  }

  /**
   * 日（週）の系列を generate_series で作り、日本時間の日（週）で束ねた提出・単語帳の答え・登録を left join する（0 の日も返す）
   */
  public async findOverviewSeries(range: { bucket: "day" | "week"; fromDate: string; toDate: string }): Promise<SeriesPoint[]> {
    const step = range.bucket === "week" ? "1 week" : "1 day"
    const lastBucketDays = range.bucket === "week" ? 7 : 1
    const start = convertTokyoDateToUtcStart(sql`${range.fromDate}::date`)
    const end = convertTokyoDateToUtcStart(sql`${range.toDate}::date + ${lastBucketDays}::integer`)
    const result = await this._db.execute<{ active_users: string; date: string; new_users: string; solved_attempts: string }>(sql`
      WITH buckets AS (
        SELECT generate_series(${range.fromDate}::date::timestamp, ${range.toDate}::date::timestamp, ${step}::interval)::date AS bucket
      ),
      solved AS (
        SELECT ${truncateToTokyoBucket(sql`ra.submitted_at`, range.bucket)} AS bucket, ra.user_id
          FROM reading_attempts ra
         WHERE ra.status = 'submitted' AND ra.submitted_at >= ${start} AND ra.submitted_at < ${end}
      ),
      reviewed AS (
        SELECT ${truncateToTokyoBucket(sql`vr.created_at`, range.bucket)} AS bucket, vr.user_id
          FROM vocabulary_reviews vr
         WHERE vr.created_at >= ${start} AND vr.created_at < ${end}
      ),
      registered AS (
        SELECT ${truncateToTokyoBucket(sql`u.created_at`, range.bucket)} AS bucket
          FROM users u
         WHERE u.created_at >= ${start} AND u.created_at < ${end}
      ),
      solved_counts AS (SELECT bucket, count(*) AS solved_attempts FROM solved GROUP BY bucket),
      active_counts AS (
        SELECT bucket, count(DISTINCT user_id) AS active_users
          FROM (SELECT bucket, user_id FROM solved UNION SELECT bucket, user_id FROM reviewed) studied
         GROUP BY bucket
      ),
      registered_counts AS (SELECT bucket, count(*) AS new_users FROM registered GROUP BY bucket)
      SELECT b.bucket::text AS date,
             coalesce(sc.solved_attempts, 0) AS solved_attempts,
             coalesce(ac.active_users, 0) AS active_users,
             coalesce(rc.new_users, 0) AS new_users
        FROM buckets b
        LEFT JOIN solved_counts sc ON sc.bucket = b.bucket
        LEFT JOIN active_counts ac ON ac.bucket = b.bucket
        LEFT JOIN registered_counts rc ON rc.bucket = b.bucket
       ORDER BY b.bucket
    `)
    return result.rows.map((row) => ({
      activeUsers: Number(row.active_users),
      date: row.date,
      newUsers: Number(row.new_users),
      solvedAttempts: Number(row.solved_attempts),
    }))
  }

  /**
   * 範囲外のページ（offset が 1 以上で行が 0 件）では count(*) OVER () が取れないので、件数だけ数え直す
   */
  public async findPassageStats(query: FindPassageStatsQuery): Promise<{ items: PassageStatsRow[]; total: number }> {
    const filter = sql`(p.status = 'published' OR s.solved_attempts > 0)${query.q === undefined ? sql`` : sql` AND p.title ILIKE ${buildContainsLikePattern(query.q)} ESCAPE '\\'`}`
    const direction = query.order === "asc" ? sql`ASC` : sql`DESC`
    const result = await this._db.execute<PassageStatsQueryRow>(sql`
      ${this._buildPassageStatsSelect(query, filter)}
       ORDER BY ${PASSAGE_STATS_SORT_EXPRESSIONS[query.sort]} ${direction} NULLS LAST, p.id
       LIMIT ${query.limit} OFFSET ${query.offset}
    `)
    if (result.rows.length > 0) {
      return { items: result.rows.map(convertPassageStatsRow), total: Number(result.rows[0].total) }
    }
    if (query.offset === 0) return { items: [], total: 0 }
    const counted = await this._db.execute<{ total: string }>(sql`
      SELECT count(*) AS total FROM (${this._buildPassageStatsSelect(query, filter)}) counted
    `)
    return { items: [], total: Number(counted.rows[0]?.total ?? 0) }
  }

  public async findPassageStatsById(passageId: number, range: StatsTimeRange): Promise<PassageStatsRow | null> {
    const result = await this._db.execute<PassageStatsQueryRow>(this._buildPassageStatsSelect(range, sql`p.id = ${passageId}`))
    const row = result.rows[0]
    return row ? convertPassageStatsRow(row) : null
  }

  /**
   * 設問の一覧と、(設問, 選んだ選択肢, 正誤) ごとの解答の数を別々に引き、設問ごとに足し合わせる
   */
  public async findQuestionStats(passageId: number, range: StatsTimeRange): Promise<QuestionStatsRow[]> {
    const [questionResult, answerResult] = await Promise.all([
      this._db.execute<{ id: number; choices: string[]; correct_choice_index: number; order_index: number; prompt: string; type: QuestionType }>(sql`
        SELECT q.id, q.choices, q.correct_choice_index, q.order_index, q.prompt, q.type
          FROM questions q
         WHERE q.passage_id = ${passageId}
         ORDER BY q.order_index
      `),
      this._db.execute<{ answers: string; is_correct: boolean; question_id: number; selected_choice_index: number | null }>(sql`
        SELECT aa.question_id, aa.selected_choice_index, aa.is_correct, count(*) AS answers
          FROM attempt_answers aa
          JOIN reading_attempts ra ON ra.id = aa.attempt_id
         WHERE ra.passage_id = ${passageId} AND ra.status = 'submitted' AND ${buildPeriodCondition(sql`ra.submitted_at`, range)}
         GROUP BY aa.question_id, aa.selected_choice_index, aa.is_correct
      `),
    ])
    const byQuestionId = new Map<number, QuestionStatsRow>(
      questionResult.rows.map((row) => [
        row.id,
        {
          id: row.id,
          answerCount: 0,
          choiceCounts: row.choices.map(() => 0),
          choices: row.choices,
          correctChoiceIndex: row.correct_choice_index,
          correctCount: 0,
          orderIndex: row.order_index,
          prompt: row.prompt,
          type: row.type,
          unansweredCount: 0,
        },
      ]),
    )
    for (const answer of answerResult.rows) {
      const question = byQuestionId.get(answer.question_id)
      if (!question) continue
      const answers = Number(answer.answers)
      question.answerCount += answers
      if (answer.is_correct) question.correctCount += answers
      if (answer.selected_choice_index === null) {
        question.unansweredCount += answers
      } else if (answer.selected_choice_index < question.choiceCounts.length) {
        /**
         * 選択肢は生成と admin の保存の検査でいつも QUESTION_CHOICE_COUNT 個あるので、範囲外の番号は起きない（起きても選択肢には数えない）
         */
        question.choiceCounts[answer.selected_choice_index] += answers
      }
    }
    return [...byQuestionId.values()]
  }

  /**
   * 提出・単語帳の答え・登録をそれぞれ期間で絞り、1 行にまとめる。学習したユーザーは提出と単語帳の user_id の和集合
   * （CTE は使う列だけにし、和集合の前にそれぞれ重複を除いて、並べ替える行を減らす）
   */
  public async summarizeOverview(range: StatsTimeRange): Promise<OverviewTotals> {
    const result = await this._db.execute<AttemptTotalsRow & { active_users: string; new_users: string; total_users: string }>(sql`
      WITH solved AS (
        SELECT ra.user_id, ra.correct_count, ra.question_count, ra.elapsed_seconds, ra.is_overtime,
               ra.translated_block_count, ra.translated_question_count, ra.word_lookup_count, ra.listened_block_count
          FROM reading_attempts ra
         WHERE ra.status = 'submitted' AND ${buildPeriodCondition(sql`ra.submitted_at`, range)}
      )
      SELECT ${ATTEMPT_TOTAL_COLUMNS},
             (SELECT count(*) FROM users) AS total_users,
             (SELECT count(*) FROM users u WHERE ${buildPeriodCondition(sql`u.created_at`, range)}) AS new_users,
             (SELECT count(*) FROM (
                SELECT DISTINCT user_id FROM solved
                UNION
                SELECT DISTINCT vr.user_id FROM vocabulary_reviews vr WHERE ${buildPeriodCondition(sql`vr.created_at`, range)}
             ) studied) AS active_users
        FROM solved ra
    `)
    const row = result.rows[0]
    return {
      ...convertAttemptTotalsRow(row),
      activeUsers: Number(row.active_users),
      newUsers: Number(row.new_users),
      totalUsers: Number(row.total_users),
    }
  }

  /**
   * 期間内の提出を問題ごとに束ねた集計（s）を、問題（p）とソース（cs）に left join する SELECT。condition で行を絞る
   */
  private _buildPassageStatsSelect(range: StatsTimeRange, condition: SQL): SQL {
    return sql`
      WITH s AS (
        SELECT ra.passage_id, ${ATTEMPT_TOTAL_COLUMNS}
          FROM reading_attempts ra
         WHERE ra.status = 'submitted' AND ${buildPeriodCondition(sql`ra.submitted_at`, range)}
         GROUP BY ra.passage_id
      )
      SELECT p.id, p.title, p.status, p.difficulty, p.published_at::text AS published_at, p.time_limit_seconds,
             cs.id AS source_id, cs.name AS source_name,
             s.solved_attempts, s.solved_users, s.correct_count, s.question_count, s.elapsed_seconds_sum,
             s.overtime_attempts, s.translated_attempts, s.translated_question_attempts, s.looked_up_attempts, s.listened_attempts,
             count(*) OVER () AS total
        FROM passages p
        JOIN source_documents sd ON sd.id = p.source_document_id
        JOIN content_sources cs ON cs.id = sd.source_id
        LEFT JOIN s ON s.passage_id = p.id
       WHERE ${condition}
    `
  }
}
