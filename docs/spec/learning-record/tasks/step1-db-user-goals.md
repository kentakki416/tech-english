# step1-db-user-goals

目標のテーブル `user_goals` と、学習記録の計算に使う `@repo/domain` の定数・型・純関数（連続学習日数・色の段階・週の範囲）を作る。API はまだ作らない。

## 前提

- [github-auth step1-db-user-timezone](../../github-auth/tasks/step1-db-user-timezone.md)（`users.timezone`）
- [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)（実装の順番で前の段。`packages/db` の `@repo/domain` 依存はここまでに入っている）

仕様は [README の「目標」「連続学習日数」「学習カレンダー」「必要な DB 設計」](../README.md#必要な-db-設計) を参照。

## 対応内容

### 1. `@repo/domain` の定数と型

```typescript
/** packages/domain/src/const/goal.ts */

/**
 * 週の目標の指標（問題数 / 学習時間〈分〉）
 */
export const GOAL_METRICS = ["passages", "minutes"] as const

/**
 * 自由記述の目標の最大文字数（DB の varchar と API の検証の両方が参照する）
 */
export const GOAL_TEXT_MAX_LENGTH = 200
```

```typescript
/** packages/domain/src/types/goal.ts */
import type { GOAL_METRICS } from "../const/goal"

/**
 * 週の目標の指標
 */
export type GoalMetric = (typeof GOAL_METRICS)[number]

/**
 * ユーザーの目標（1 ユーザー 1 行）。日付は `YYYY-MM-DD` の文字列で持つ
 */
export type UserGoal = {
  id: number
  goalText: string | null
  targetDate: string | null
  userId: number
  weeklyMetric: GoalMetric | null
  weeklyTarget: number | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 学習カレンダーの色の段階（0 = 学習なし 〜 4）
 */
export type CalendarLevel = 0 | 1 | 2 | 3 | 4

/**
 * 連続学習日数（現在 / 最長）
 */
export type StreakSummary = { current: number, longest: number }

/**
 * 週の範囲（月曜〜日曜。`YYYY-MM-DD`）
 */
export type WeekRange = { end: string, start: string }
```

`rules/goal.ts` に type guard を置く（`rules/membership-tier.ts` と同じ形）。

```typescript
/** packages/domain/src/rules/goal.ts */
import { GOAL_METRICS } from "../const/goal"
import type { GoalMetric } from "../types/goal"

export const isGoalMetric = (value: string): value is GoalMetric =>
  (GOAL_METRICS as readonly string[]).includes(value)
```

### 2. `@repo/domain` の純関数（`rules/learning-record.ts`）

日付は **`YYYY-MM-DD` の文字列** で受け渡し、関数の中でタイムゾーンを扱わない。「今日」は呼び出し側（api の service）が `users.timezone` で求めて引数で渡す。日付の計算は `Date.UTC` で行う（ブラウザ / React Native でも動く書き方にする。`packages/domain/README.md`）。

```typescript
/** packages/domain/src/rules/learning-record.ts */
import type { CalendarLevel, StreakSummary, WeekRange } from "../types/goal"

const MILLISECONDS_PER_DAY = 86_400_000

/**
 * 色の段階が上がる学習秒数の上限（5 分 / 15 分 / 30 分。上限ちょうどは下の段階）
 */
const LEVEL_UPPER_SECONDS = [300, 900, 1800] as const

const convertDateToUtcMilliseconds = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * 日付に日数を足す（負の数で過去へ）
 */
export const addDaysToDate = (date: string, days: number): string =>
  new Date(convertDateToUtcMilliseconds(date) + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10)

/**
 * from から to までの日数（同じ日なら 0、to が前なら負）
 */
export const countDaysBetween = (from: string, to: string): number =>
  Math.round((convertDateToUtcMilliseconds(to) - convertDateToUtcMilliseconds(from)) / MILLISECONDS_PER_DAY)

/**
 * 学習した日の一覧から、現在の連続日数と最長記録を求める。
 * 今日まだ学習していなくても、昨日まで続いていれば途切れていないとみなす。
 */
export const calculateStreak = (studyDates: readonly string[], today: string): StreakSummary => {
  const dates = [...new Set(studyDates)].sort()
  if (dates.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let index = 1; index < dates.length; index++) {
    run = countDaysBetween(dates[index - 1], dates[index]) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }

  /** 今日より後の日付（タイムゾーンを西に変えた直後に起こりうる）は今日と同じく「続いている」扱い */
  const isAlive = dates[dates.length - 1] >= addDaysToDate(today, -1)
  return { current: isAlive ? run : 0, longest }
}

/**
 * 1 日の学習秒数をカレンダーの色の段階にする（0 / 〜5 分 / 〜15 分 / 〜30 分 / 30 分超）
 */
export const convertStudySecondsToLevel = (seconds: number): CalendarLevel => {
  if (seconds <= 0) return 0
  const index = LEVEL_UPPER_SECONDS.findIndex((upper) => seconds <= upper)
  return (index === -1 ? 4 : index + 1) as CalendarLevel
}

/**
 * 今日を含む週（月曜始まり）の範囲
 */
export const getWeekRange = (today: string): WeekRange => {
  const mondayOffset = (new Date(convertDateToUtcMilliseconds(today)).getUTCDay() + 6) % 7
  const start = addDaysToDate(today, -mondayOffset)
  return { end: addDaysToDate(start, 6), start }
}
```

`src/index.ts` に re-export を足す（ファイル名順。const → rules → types の既存の並びに合わせる）。

```typescript
export { GOAL_METRICS, GOAL_TEXT_MAX_LENGTH } from "./const/goal"
export { isGoalMetric } from "./rules/goal"
export { addDaysToDate, calculateStreak, convertStudySecondsToLevel, countDaysBetween, getWeekRange } from "./rules/learning-record"
export type { CalendarLevel, GoalMetric, StreakSummary, UserGoal, WeekRange } from "./types/goal"
```

### 3. `@repo/domain` のテスト環境

`packages/domain` に vitest が無ければ（先行の step で入っていなければ）`packages/events` と同じ構成で足す。

- `package.json`: `"test": "vitest run"`、`"test:ci": "vitest run"`、devDependencies に `vitest`
- `vitest.config.ts`: `globals: true`、`include: ["test/**/*.test.ts"]`
- テストは `packages/domain/test/rules/learning-record.test.ts`（`dependencies` は空のまま）

### 4. `user_goals` の Drizzle スキーマ

`packages/db/src/drizzle/schema/user-goal.ts`。FK は `auth-account.ts` と同じ書き方、CHECK は `docs/tech-stack/drizzle.md` の「enum 的な列は const から CHECK 制約を作る」に従う。

```typescript
import { sql } from "drizzle-orm"
import { check, date, foreignKey, integer, pgTable, serial, text, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import { GOAL_METRICS, GOAL_TEXT_MAX_LENGTH } from "@repo/domain"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * ユーザーの目標（1 ユーザー 1 行。users の削除で cascade）
 */
export const userGoals = pgTable(
  "user_goals",
  {
    id: serial("id").primaryKey(),
    goalText: varchar("goal_text", { length: GOAL_TEXT_MAX_LENGTH }),
    /** `mode: "string"` で `YYYY-MM-DD` のまま読み書きする */
    targetDate: date("target_date", { mode: "string" }),
    userId: integer("user_id").notNull(),
    weeklyMetric: text("weekly_metric", { enum: GOAL_METRICS }),
    weeklyTarget: integer("weekly_target"),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "user_goals_user_id_fkey" })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("user_goals_user_id_key").on(table.userId),
    check(
      "user_goals_weekly_metric_check",
      sql`${table.weeklyMetric} IN (${sql.join(GOAL_METRICS.map((metric) => sql`${metric}`), sql`, `)})`,
    ),
    check("user_goals_weekly_pair_check", sql`(${table.weeklyMetric} IS NULL) = (${table.weeklyTarget} IS NULL)`),
    check("user_goals_weekly_target_check", sql`${table.weeklyTarget} >= 1`),
  ],
)
```

- `schema/index.ts` に `export * from "./user-goal"` を足す（ファイル名順）
- `pnpm --filter api db:generate` でマイグレーションを作り、生成された SQL に FK（`ON DELETE cascade`）・unique index・3 つの CHECK があることを目で確認する

## 動作確認

```bash
pnpm --filter @repo/domain test
pnpm --filter api db:generate && pnpm --filter api db:migrate
pnpm build && pnpm lint:fix
```

`learning-record.test.ts`（`describe` は関数ごと、その下を「正常系」「異常系」で分ける。表で回せるものは `it.each`）:

- [ ] `convertStudySecondsToLevel`: `-1`→0、`0`→0、`1`→1、`300`→1、`301`→2、`900`→2、`901`→3、`1800`→3、`1801`→4
- [ ] `calculateStreak`: 空配列 → `{ current: 0, longest: 0 }`
- [ ] 今日だけ → current 1 / 昨日だけ → current 1（今日未学習でも途切れない）/ 一昨日まで → current 0、longest は残る
- [ ] 今日・昨日・一昨日 → 3。間に 1 日の空きがあると空きの後から数え直す
- [ ] 過去の最長（例 5 日）が現在（2 日）より長いとき longest 5・current 2
- [ ] 重複した日付・並び順がばらばらの入力でも同じ結果
- [ ] 月またぎ（`2026-10-31`→`2026-11-01`）・年またぎ（`2026-12-31`→`2027-01-01`）・うるう日（`2028-02-28`→`02-29`→`03-01`）で連続と数える
- [ ] 今日より後の日付だけがある（タイムゾーン変更直後）→ current は途切れない
- [ ] `getWeekRange`: 月曜（`2026-10-05`）→ `2026-10-05`〜`2026-10-11` / 土曜（`2026-10-10`）→ 同じ週 / 日曜（`2026-10-11`）→ 同じ週 / 年またぎ（`2027-01-01` 金曜）→ `2026-12-28`〜`2027-01-03`
- [ ] `addDaysToDate` / `countDaysBetween`: うるう年の 2 月末・年またぎ・負の日数

DB の制約（psql で確認。Repository のテストは step2 / step3 で書く）:

- [ ] 同じ `user_id` の 2 行目は unique 違反になる
- [ ] `weekly_metric = 'hours'` は CHECK 違反になる
- [ ] `weekly_metric` だけ入れて `weekly_target` が NULL の行は CHECK 違反になる（逆も同様）
- [ ] `weekly_target = 0` は CHECK 違反、すべて NULL の行は入る
- [ ] `users` の行を消すと `user_goals` の行も消える
