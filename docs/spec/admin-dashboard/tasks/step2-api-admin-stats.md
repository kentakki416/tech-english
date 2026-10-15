# step2-api-admin-stats

ダッシュボードの API を 3 つ足す：全体の利用状況（`GET /api/admin/stats/overview`）、問題ごとの成績（`GET /api/admin/stats/passage`）、問題の分析（`GET /api/admin/stats/passage/:id`）。集計は新しい `AdminStatsRepository` に SQL で書き、Service は期間の解釈・比率・「要確認」の判定を受け持つ。

## 前提

- [step1-db-stats-indexes](./step1-db-stats-indexes.md)
- 既存の admin の API（`src/routes/admin-router.ts`・`src/controller/admin/passage/*`・`src/service/admin-passage-service.ts`）と同じ形にする。方針は `apps/api/CLAUDE.md` の「Admin API 設計方針」
- 数字の意味は README の [用語](../README.md#用語)・[期間](../README.md#期間)・[問題の分析](../README.md#問題の分析)、集計の方法は [集計の方法](../README.md#集計の方法)・[期間と日の区切り](../README.md#期間と日の区切り)

## 対応内容

### 1. `@repo/domain`

値は `src/const/admin-stats.ts`、型は `src/types/admin-stats.ts`（値から導出）に足し、`src/index.ts` に名前を列挙して export する（名前順。`packages/domain/README.md` の const / types の分け方）。api-schema の `z.enum` はここから作る。

```typescript
/** packages/domain/src/const/admin-stats.ts */

/**
 * ダッシュボードの期間（直近 7 日・直近 30 日・全期間）
 */
export const ADMIN_STATS_PERIODS = ["7d", "30d", "all"] as const

/**
 * 問題ごとの成績の並べ替えの列
 */
export const ADMIN_PASSAGE_STATS_SORTS = [
  "average_elapsed_seconds",
  "correct_rate",
  "overtime_rate",
  "published_at",
  "solved_attempts",
  "solved_users",
] as const

/**
 * 問題の分析で「要確認」の印を付けるのに要る、設問の期間内の解答の数の下限
 */
export const ADMIN_QUESTION_REVIEW_MIN_ANSWERS = 5
```

```typescript
/** packages/domain/src/types/admin-stats.ts */
import type { ADMIN_PASSAGE_STATS_SORTS, ADMIN_STATS_PERIODS } from "../const/admin-stats"

export type AdminStatsPeriod = (typeof ADMIN_STATS_PERIODS)[number]
export type AdminPassageStatsSort = (typeof ADMIN_PASSAGE_STATS_SORTS)[number]
```

### 2. API スキーマ

`packages/schema/src/api-schema/admin/stats.ts` を足し、`src/api-schema/index.ts` で re-export する（`admin/passage` の後）。比率は 0〜1 の小数で、分母が 0 なら `null`。日付は日本時間の `YYYY-MM-DD`。

```typescript
/** packages/schema/src/api-schema/admin/stats.ts */
import { z } from "zod"

import { ADMIN_PASSAGE_STATS_SORTS, ADMIN_STATS_PERIODS, PASSAGE_STATUSES, QUESTION_TYPES } from "@repo/domain"

/**
 * 比率（0〜1）。分母が 0 なら null
 */
const rateSchema = z.number().min(0).max(1).nullable()

/**
 * アシストの利用率（解いたうち、和訳を開いた・単語を調べた・読み上げを聞いた割合）
 */
const assistRatesSchema = z.object({
  listened: rateSchema,
  looked_up: rateSchema,
  translated: rateSchema,
})

// ========================================================
// GET /api/admin/stats/overview - 全体の利用状況
// ========================================================

export const getAdminStatsOverviewQueryStringSchema = z.object({
  period: z.enum(ADMIN_STATS_PERIODS).default("30d"),
})

export const getAdminStatsOverviewResponseSchema = z.object({
  active_users: z.number().int(),
  assist_rates: assistRatesSchema,
  correct_rate: rateSchema,
  /**
   * 期間の始まりと終わり（日本時間の日付）。全期間の from は最初のユーザーの登録日（ユーザーがいなければ今日）
   */
  from: z.string(),
  new_users: z.number().int(),
  period: z.enum(ADMIN_STATS_PERIODS),
  /**
   * 推移。7d / 30d は日ごと、all は週ごと（日本時間の月曜始まり。date はその週の月曜）
   */
  series: z.object({
    bucket: z.enum(["day", "week"]),
    points: z.array(z.object({
      active_users: z.number().int(),
      date: z.string(),
      new_users: z.number().int(),
      solved_attempts: z.number().int(),
    })),
  }),
  solved_attempts: z.number().int(),
  solved_users: z.number().int(),
  to: z.string(),
  /**
   * 今の登録ユーザーの総数（期間に関係しない）
   */
  total_users: z.number().int(),
})

// ========================================================
// GET /api/admin/stats/passage - 問題ごとの成績
// ========================================================

export const getAdminPassageStatsListQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  /**
   * タイトルの部分一致
   */
  q: z.string().trim().min(1).max(200).optional(),
  period: z.enum(ADMIN_STATS_PERIODS).default("30d"),
  sort: z.enum(ADMIN_PASSAGE_STATS_SORTS).default("solved_users"),
})

/**
 * 問題ごとの成績の 1 行（問題の分析の上部にも使う）
 */
export const adminPassageStatsRowSchema = z.object({
  id: z.number().int(),
  assist_rates: assistRatesSchema,
  average_elapsed_seconds: z.number().nullable(),
  correct_rate: rateSchema,
  difficulty: z.number().int().nullable(),
  overtime_rate: rateSchema,
  published_at: z.string().nullable(),
  solved_attempts: z.number().int(),
  solved_users: z.number().int(),
  source: z.object({ id: z.number().int(), name: z.string() }),
  status: z.enum(PASSAGE_STATUSES),
  time_limit_seconds: z.number().int().nullable(),
  title: z.string(),
})

export const getAdminPassageStatsListResponseSchema = z.object({
  limit: z.number().int(),
  page: z.number().int(),
  passages: z.array(adminPassageStatsRowSchema),
  total: z.number().int(),
})

// ========================================================
// GET /api/admin/stats/passage/:id - 問題の分析
// ========================================================

export const getAdminPassageStatsPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const getAdminPassageStatsQueryStringSchema = z.object({
  period: z.enum(ADMIN_STATS_PERIODS).default("30d"),
})

export const getAdminPassageStatsResponseSchema = z.object({
  passage: adminPassageStatsRowSchema,
  period: z.enum(ADMIN_STATS_PERIODS),
  questions: z.array(z.object({
    id: z.number().int(),
    answer_count: z.number().int(),
    /**
     * 選択肢ごとの選ばれた割合（choices と同じ順。未回答は分母に入れる）
     */
    choice_rates: z.array(rateSchema),
    choices: z.array(z.string()),
    correct_choice_index: z.number().int(),
    correct_rate: rateSchema,
    /**
     * 正解でないのに、正解と同じかそれ以上選ばれた選択肢の番号（画面で橙にする）。解答が ADMIN_QUESTION_REVIEW_MIN_ANSWERS 件より少なければ空
     */
    misleading_choice_indexes: z.array(z.number().int()),
    /**
     * 要確認（misleading_choice_indexes が空でない）
     */
    needs_review: z.boolean(),
    order_index: z.number().int(),
    prompt: z.string(),
    type: z.enum(QUESTION_TYPES),
    unanswered_rate: rateSchema,
  })),
})
```

型（`GetAdminStatsOverviewResponse` など）も同じファイルで `z.infer` して export する。期間と並べ替えの型（`AdminStatsPeriod`・`AdminPassageStatsSort`）も `z.infer` でここから export する（admin はこちらを使う）。`pnpm --filter @repo/api-schema build`。

### 3. 期間の解釈（純関数）

`src/lib/resolve-stats-period.ts`。日本時間の今日から期間の始まり（UTC の `Date`）と推移の刻みを決める。

```typescript
/** apps/api/src/lib/resolve-stats-period.ts */
import type { AdminStatsPeriod } from "@repo/domain"

/**
 * 期間の範囲。from は日本時間の始まりの日の 0 時（UTC の Date）。all は null（最初から）
 */
export type StatsPeriodRange = {
  bucket: "day" | "week"
  from: Date | null
  /**
   * 日本時間の始まりの日・今日（YYYY-MM-DD）。all の fromDate は呼び出し側が最初のユーザーの登録日で埋める
   */
  fromDate: string | null
  to: Date
  toDate: string
}

/**
 * 7d / 30d は今日を含む 7 日・30 日（日ごと）、all は全期間（週ごと）
 */
export const resolveStatsPeriod = (period: AdminStatsPeriod, now: Date): StatsPeriodRange => {
  /** formatDateInTimeZone(now, "Asia/Tokyo") で今日、addDaysToDate で始まりの日を求め、その日の日本時間 0 時を UTC の Date にする */
}
```

- 日付は既存の `src/lib/time-zone.ts` の `formatDateInTimeZone` と `@repo/domain` の `addDaysToDate` を使う。日付の 0 時を UTC の `Date` にする `convertDateToStartInstant(date, utcOffset)` を `src/lib/time-zone.ts` に足し、`@repo/domain` の `ADMIN_STATS_UTC_OFFSET`（`+09:00`。日本は夏時間が無い）を渡す。`ADMIN_STATS_TIME_ZONE` と食い違わないことをテストで確かめる
- 日本時間（`"Asia/Tokyo"`）は `@repo/domain` の `ADMIN_STATS_TIME_ZONE`（`const/admin-stats.ts`）にして、Repository の SQL と同じ値を使う
- テスト（`test/lib/resolve-stats-period.test.ts`）：日本時間の 0 時の前後（UTC 14:59 / 15:00）で今日が変わる、7d の from は 6 日前の 0 時、all の from は null で bucket が week

### 4. 「要確認」の判定（純関数）

`@repo/domain` の `src/rules/admin-stats.ts`（業務ルールは domain の `rules/`。下限の定数と同じ場所）。テストは `packages/domain/test/rules/admin-stats.test.ts`。画面で橙にする選択肢も API が返す（admin は domain を import できないので、判定を画面で書き直さない）。

```typescript
/** packages/domain/src/rules/admin-stats.ts */
import { ADMIN_QUESTION_REVIEW_MIN_ANSWERS } from "../const/admin-stats"

type QuestionChoiceCounts = { answerCount: number, choiceCounts: number[], correctChoiceIndex: number }

/**
 * 正解でないのに、正解と同じかそれ以上選ばれた選択肢の番号（その設問の期間内の解答が下限より少なければ空。1 度も選ばれていない選択肢は数えない）
 */
export const findMisleadingChoiceIndexes = (input: QuestionChoiceCounts): number[] => {
  if (input.answerCount < ADMIN_QUESTION_REVIEW_MIN_ANSWERS) return []
  const correctCount = input.choiceCounts[input.correctChoiceIndex] ?? 0
  return input.choiceCounts.flatMap((count, index) => (index !== input.correctChoiceIndex && count > 0 && count >= correctCount ? [index] : []))
}

/**
 * 要確認の設問か（判定は findMisleadingChoiceIndexes と同じ）
 */
export const isQuestionNeedingReview = (input: QuestionChoiceCounts): boolean => findMisleadingChoiceIndexes(input).length > 0
```

- テスト：解答 4 件は判定しない・5 件は判定する、正解と同数も含む、正解が最多なら空、誰も選んでいない選択肢（0 件）は正解が 0 件でも含めない

### 5. Repository

`src/repository/admin-stats-repository.ts`（interface）と `src/repository/drizzle/admin-stats-repository.ts`（実装）。`src/repository/index.ts` と `src/repository/drizzle/index.ts` の両方のバレルに足す。

```typescript
/** apps/api/src/repository/admin-stats-repository.ts */
import type { AdminPassageStatsSort } from "@repo/domain"

/**
 * 解いた挑戦の合計（比率は Service で求める）
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
}

export type OverviewTotals = AttemptTotals & { activeUsers: number; newUsers: number; totalUsers: number }

export type SeriesPoint = { activeUsers: number; date: string; newUsers: number; solvedAttempts: number }

export type PassageStatsRow = AttemptTotals & {
  id: number
  difficulty: number | null
  publishedAt: Date | null
  source: { id: number; name: string }
  status: PassageStatus
  timeLimitSeconds: number | null
  title: string
}

export type QuestionStatsRow = {
  id: number
  /**
   * 期間内の提出済みの挑戦での、この設問の解答の数（未回答を含む）
   */
  answerCount: number
  /**
   * choices と同じ長さ。期間内の提出済みの挑戦で、その選択肢を選んだ解答の数
   */
  choiceCounts: number[]
  choices: string[]
  correctChoiceIndex: number
  correctCount: number
  orderIndex: number
  prompt: string
  type: QuestionType
  unansweredCount: number
}

/**
 * admin のダッシュボードの集計（読み取りだけ）。from が null なら全期間、to は今
 */
export interface AdminStatsRepository {
  /**
   * 最初のユーザーの登録日時（全期間の推移の始まり）。ユーザーがいなければ null
   */
  findFirstUserCreatedAt(): Promise<Date | null>
  summarizeOverview(range: { from: Date | null; to: Date }): Promise<OverviewTotals>
  /**
   * 日本時間の日（週）ごとの推移。fromDate〜toDate のすべての日（週）を 0 埋めで返す
   */
  findOverviewSeries(range: { bucket: "day" | "week"; fromDate: string; toDate: string }): Promise<SeriesPoint[]>
  /**
   * 公開中の問題と、期間内に解かれた問題の成績。並べ替え・絞り込み・ページ分けまでする
   */
  findPassageStats(query: {
    from: Date | null
    limit: number
    offset: number
    order: "asc" | "desc"
    q?: string
    sort: AdminPassageStatsSort
    to: Date
  }): Promise<{ items: PassageStatsRow[]; total: number }>
  /**
   * 1 つの問題の成績（状態を問わない）。問題が無ければ null
   */
  findPassageStatsById(passageId: number, range: { from: Date | null; to: Date }): Promise<PassageStatsRow | null>
  /**
   * 1 つの問題の設問ごとの集計（order_index の順）
   */
  findQuestionStats(passageId: number, range: { from: Date | null; to: Date }): Promise<QuestionStatsRow[]>
}
```

実装のメモ：

- 日本時間への変換は `(col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo'`（timestamp は UTC で保存している。`packages/db` の `columns.ts`）。SQL の断片は `src/repository/drizzle/` 内の定数にまとめる
- 期間は `submitted_at >= from AND submitted_at < to`（`from` が null なら下限なし）。`status = 'submitted'` を必ず付ける（部分インデックスを使うため）
- 学習したユーザーは `reading_attempts`（提出済み・期間内）と `vocabulary_reviews`（`created_at` が期間内）の `user_id` を `UNION` してから数える
- 推移は `generate_series(fromDate::date, toDate::date, '1 day' | '1 week')` に、日本時間の日（`date_trunc('day' | 'week', …)`）で束ねた集計を left join する。週の `date_trunc('week')` は月曜始まりなので、週ごとのときは Service が `fromDate`・`toDate` をその週の月曜（`@repo/domain` の `getWeekRange(date).start`）にそろえてから渡す（そろえないと系列の日付と束ねた週がずれ、すべて 0 になる）
- 期間の比較は Drizzle の `gte` / `lt`（列の型で UTC に直して送る）を使う。生の `sql` に `Date` を埋め込むときは `toISOString()` を渡す（`Date` のままだと Node のタイムゾーンのずれが入る）
- 問題ごとの成績は、期間内の提出を `passage_id` で束ねた CTE を `passages`（`source_documents` → `content_sources` でソース名）に left join し、`WHERE p.status = 'published' OR a.solved_attempts > 0`。並べ替えは `sort` を列の対応表（`Record<AdminPassageStatsSort, SQL>`）で SQL に直し、`NULLS LAST`・同じ値は `p.id` の順。`total` は同じ条件の `count(*) OVER ()` で一緒に取る。ページの範囲外（行が 0 件）のときは、件数だけ別の `count(*)` で数え直す
- 比率の並べ替え（`correct_rate` など）は SQL の中で `correct_count::float / NULLIF(question_count, 0)` を計算して並べる
- `q` は `ILIKE` の `%`・`_`・`\` をエスケープしてから `%q%` にする（`src/repository/drizzle/like-pattern.ts` の `buildContainsLikePattern`。admin-users の一覧と共有。SQL は `ESCAPE '\'`）
- 問題の分析は、その問題の期間内の提出済みの挑戦の `attempt_answers` を `question_id`・`selected_choice_index` で束ね、`questions` に left join する（解かれていない設問も返す）。`choiceCounts` は `choices` の長さの配列に詰め直す

テスト（`test/repository/admin-stats-repository.test.ts`、実 DB）：

- 期間の境界：`from` ちょうどの提出は入り、`to` ちょうどは入らない
- `in_progress`・`expired` は数えない。同じ人の 2 回の提出は解いた回数 2・解いた人数 1
- 学習したユーザー：問題だけ・単語帳だけ・両方の人がそれぞれ 1 人に数えられる
- 推移：提出の無い日が 0 で返る。日本時間の 23:59 と翌 0:00 の提出が別の日になる。週は月曜で区切られる（月曜にそろえた `fromDate` を渡す）
- 問題ごとの成績：期間内に解かれていない公開中の問題は 0 で入り、解かれていない下書きは入らない、非公開に戻した問題は解かれていれば入る。各 `sort` で並ぶ・`NULLS LAST`・`q` の `%` がそのままの文字として扱われる・`total` と `offset`・範囲外のページでも `total` が正しい
- 問題の分析：未回答（`selected_choice_index` が NULL）は `unansweredCount` に入る（`answerCount` にも数える）、解かれていない設問も返る
- 挑戦は `test/fixture/learning-record.ts` の `createSubmittedAttempt`、単語帳の復習は `test/fixture/vocabulary.ts` の関数で入れる。`createSubmittedAttempt` は選んだ選択肢を正誤から決めている（正解 1・不正解 0）ので、`selectedChoiceIndexes?: (number | null)[]`（null は未回答）を足して選択肢の割合を試せるようにする

### 6. Service

`src/service/admin-stats-service.ts` を足し、`src/service/index.ts` に `export * as adminStats from "./admin-stats-service"`（名前順で `adminPassage` の後）。

```typescript
/** apps/api/src/service/admin-stats-service.ts */

type AdminStatsRepo = { adminStatsRepository: AdminStatsRepository }

/**
 * 全体の利用状況。all の推移は最初のユーザーの登録日（いなければ今日）から
 */
export const getAdminStatsOverview = async (
  period: AdminStatsPeriod,
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminStatsOverview>> => { /** … */ }

/**
 * 問題ごとの成績（page は 1 始まり。範囲外のページは空の配列）
 */
export const getAdminPassageStatsList = async (
  query: { limit: number; order: "asc" | "desc"; page: number; period: AdminStatsPeriod; q?: string; sort: AdminPassageStatsSort },
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminPassageStatsList>> => { /** … */ }

/**
 * 問題の分析。問題が無ければ notFoundError
 */
export const getAdminPassageStats = async (
  passageId: number,
  period: AdminStatsPeriod,
  repo: AdminStatsRepo,
  deps: { now: Date },
): Promise<Result<AdminPassageStatsDetail>> => { /** … */ }
```

- 戻り値の型（`AdminStatsOverview`・`AdminPassageStatsList`・`AdminPassageStatsDetail`）は同じファイルで定義する（Repository の数を比率に直したもの・推移・期間の日付）
- 比率は `AttemptTotals` から求める共通の関数（`convertAttemptTotalsToRates`）にまとめる。分母が 0 なら `null`
- 週ごとの推移の `fromDate`（最初のユーザーの登録日）と `toDate`（今日）は、その週の月曜にそろえてから Repository に渡す
- 平均の解答時間は `elapsedSecondsSum / solvedAttempts`（0 回なら `null`）
- テスト（`test/service/admin-stats-service/` に関数ごとのファイル、Repository は `vi.fn()`）：分母 0 の比率が `null`、all の `from` が最初の登録日・ユーザーがいなければ今日、最初の登録が水曜でも週ごとの推移の始まりが月曜になる、問題が無いと 404、`misleading_choice_indexes` が `findMisleadingChoiceIndexes`（設問ごとの `answerCount`）の結果になり、`needs_review` はそれが空でないとき true

### 7. Controller・Router・DI

- `src/controller/admin/stats/overview.ts`（`AdminStatsOverviewController`）、`passage-list.ts`（`AdminPassageStatsListController`）、`passage-detail.ts`（`AdminPassageStatsDetailController`）。既存の `AdminPassageListController` と同じく `parseRequest` → Service → `parseResponse`。日付は日本時間の `YYYY-MM-DD`、`published_at` は ISO 8601
- `src/routes/admin-router.ts` の `AdminRouterControllers` に `stats?: { overview?; passageDetail?; passageList? }` を足し、`GET /stats/overview`・`GET /stats/passage`・`GET /stats/passage/:id` を登録する
- `src/index.ts` で `DrizzleAdminStatsRepository` を作り、3 つの Controller に渡す（`now` は既存の Controller と同じく実行時の `new Date()`）

テスト（`test/controller/admin/stats/*.test.ts`、supertest）：

- 正常系：3 つとも 200 と、スキーマどおりのボディ。`period` を省くと 30d
- 異常系：`X-Admin-Token` が無いと 401、`period=1y`・`sort=title`・`page=0`・`limit=101` は 400、存在しない問題の分析は 404

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm build && pnpm lint:fix
```

dev の DB で API を叩く（トークンは `apps/api/.env.local` の `ADMIN_API_TOKEN`）。

```bash
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/stats/overview?period=7d" | jq
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/stats/passage?sort=correct_rate&order=asc" | jq '.passages[] | {title, solved_users, correct_rate}'
curl -s -H "X-Admin-Token: $ADMIN_API_TOKEN" "http://localhost:8080/api/admin/stats/passage/119?period=all" | jq '.questions[] | {order_index, correct_rate, choice_rates, misleading_choice_indexes, needs_review}'
```

- [ ] 手元で問題を 1 回解くと、overview の `solved_attempts` と今日の推移が 1 増える
- [ ] 問題の分析の `choice_rates` と `unanswered_rate` の合計が 1 になる（解かれている設問）
