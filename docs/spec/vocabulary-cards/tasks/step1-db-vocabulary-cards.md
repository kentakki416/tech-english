# step1-db-vocabulary-cards

単語帳のテーブル `vocabulary_cards` / `vocabulary_reviews`（Drizzle のスキーマ・マイグレーション）と、`@repo/domain` の定数・型・純関数（答えから次の段階と次に出す日を求める）を作る。API はまだ作らない（[step2](./step2-api-vocabulary-session.md)・[step3](./step3-api-vocabulary-review.md)）。

## 前提

- 依存するテーブルは既存の `users` だけ。材料の `attempt_word_lookups` / `passage_glossary_entries` には外部キーを張らない（[README のカードの持ち方](../README.md#カードの持ち方)）
- マイグレーションのスナップショットを直列に保つため、main の最新（read-aloud まで）を取り込んでから `db:generate` する
- 仕様は README の [復習の間隔](../README.md#復習の間隔) と [必要な DB 設計](../README.md#必要な-db-設計)

## 対応内容

### 1. `@repo/domain` の定数

`packages/domain/src/const/vocabulary.ts` を新設する。

```typescript
/** packages/domain/src/const/vocabulary.ts */

/**
 * 単語帳の答え
 *
 * - remembered: 覚えた
 * - forgot: まだ
 */
export const VOCABULARY_GRADES = ["remembered", "forgot"] as const

/**
 * 答えた後の段階ごとの、次に出すまでの日数（添字が段階）。
 * 0 = まだ → 翌日、1 → 3 日後、2 → 7 日後、3 → 30 日後。段階 4（覚えた単語）はもう出さないので無い
 */
export const VOCABULARY_REVIEW_INTERVAL_DAYS = [1, 3, 7, 30] as const

/**
 * 覚えた単語の段階。この段階のカードは出題しない
 */
export const VOCABULARY_MASTERED_STAGE = 4

/**
 * 1 回の最大枚数
 */
export const VOCABULARY_SESSION_SIZE = 10

/**
 * 1 枚の見ていた秒数の上限。これを超えた申告は切り詰める
 */
export const VOCABULARY_MAX_CARD_SECONDS = 60
```

- `VOCABULARY_MASTERED_STAGE` は `VOCABULARY_REVIEW_INTERVAL_DAYS.length` と同じ値になる。テストで一致を確かめる（片方だけ変えて段階がずれないように）

### 2. `@repo/domain` の型

`packages/domain/src/types/vocabulary.ts` を新設する。

```typescript
/** packages/domain/src/types/vocabulary.ts */
import type { VOCABULARY_GRADES } from "../const/vocabulary"

/**
 * 単語帳の答え
 */
export type VocabularyGrade = (typeof VOCABULARY_GRADES)[number]

/**
 * 単語帳のカード（復習の状態だけ。表と裏の中身は出すたびに組み立てる）。1 ユーザー・1 見出し語で 1 行
 */
export type VocabularyCard = {
  id: number
  /**
   * 次に出す日（YYYY-MM-DD。users.timezone での日付）。覚えた単語は null
   */
  dueDate: string | null
  lastReviewedAt: Date
  /**
   * 見出し語の小文字
   */
  lemma: string
  /**
   * 0〜4。4 は覚えた単語
   */
  stage: number
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 1 枚の答えの記録
 */
export type VocabularyReview = {
  id: number
  /**
   * 見ていた秒数（0〜VOCABULARY_MAX_CARD_SECONDS）
   */
  activeSeconds: number
  cardId: number
  clientReviewId: string
  grade: VocabularyGrade
  stageAfter: number
  /**
   * 新しい単語（答える前にカードが無かった）は null
   */
  stageBefore: number | null
  /**
   * 答えた時点の users.timezone での日付（YYYY-MM-DD）
   */
  studyDate: string
  userId: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 答えた後のカードの段階と次に出す日
 */
export type VocabularySchedule = {
  /**
   * 覚えた単語は null
   */
  dueDate: string | null
  stage: number
}
```

### 3. `@repo/domain` の純関数

`packages/domain/src/rules/vocabulary.ts` を新設する。日付の足し算は既存の `addDaysToDate`（`rules/learning-record.ts`）を使う。

```typescript
/** packages/domain/src/rules/vocabulary.ts */
import { VOCABULARY_GRADES, VOCABULARY_MASTERED_STAGE, VOCABULARY_REVIEW_INTERVAL_DAYS } from "../const/vocabulary"
import type { VocabularyGrade, VocabularySchedule } from "../types/vocabulary"
import { addDaysToDate } from "./learning-record"

/**
 * 単語帳の答えの値かどうか
 */
export const isVocabularyGrade = (value: string): value is VocabularyGrade =>
  (VOCABULARY_GRADES as readonly string[]).includes(value)

/**
 * 見出し語をカードの単位（vocabulary_cards.lemma）にそろえる。前後の空白を除いて小文字にする
 */
export const normalizeVocabularyLemma = (lemma: string): string => lemma.trim().toLowerCase()

/**
 * 答えから、次の段階と次に出す日を求める（README「復習の間隔」）。
 * stageBefore は答える前の段階（新しい単語は null）、today は users.timezone での今日（YYYY-MM-DD）。
 * 「まだ」はどの段階からでも段階 0・翌日。「覚えた」は 1 段階進め、段階 4 に届いたら覚えた単語（次に出す日なし）
 */
export const scheduleVocabularyReview = (
  stageBefore: number | null,
  grade: VocabularyGrade,
  today: string,
): VocabularySchedule => {
  if (grade === "forgot") {
    return { dueDate: addDaysToDate(today, VOCABULARY_REVIEW_INTERVAL_DAYS[0]), stage: 0 }
  }
  const stage = Math.min((stageBefore ?? 0) + 1, VOCABULARY_MASTERED_STAGE)
  if (stage === VOCABULARY_MASTERED_STAGE) return { dueDate: null, stage }
  return { dueDate: addDaysToDate(today, VOCABULARY_REVIEW_INTERVAL_DAYS[stage]), stage }
}
```

- 新しい単語（`null`）と段階 0 は、どちらも「覚えた」で段階 1 になる
- 覚えた単語（段階 4）は出題しないので答えが来ない想定だが、来ても「覚えた」なら 4 のまま、「まだ」なら 0 に戻す（`Math.min` で 5 にならない）

### 4. `@repo/domain` の export

`packages/domain/src/index.ts` に足す（各ブロックの中はファイル名順）。

```typescript
export {
  VOCABULARY_GRADES,
  VOCABULARY_MASTERED_STAGE,
  VOCABULARY_MAX_CARD_SECONDS,
  VOCABULARY_REVIEW_INTERVAL_DAYS,
  VOCABULARY_SESSION_SIZE,
} from "./const/vocabulary"
/** …（rules のブロック。./rules/question の後） */
export { isVocabularyGrade, normalizeVocabularyLemma, scheduleVocabularyReview } from "./rules/vocabulary"
/** …（types のブロック。./types/user の後） */
export type { VocabularyCard, VocabularyGrade, VocabularyReview, VocabularySchedule } from "./types/vocabulary"
```

### 5. Drizzle のスキーマ

`packages/db/src/drizzle/schema/vocabulary-card.ts` と `vocabulary-review.ts` を新設する。FK・CHECK・index の書き方は既存の `reading-attempt.ts` / `user-goal.ts` に合わせる。

```typescript
/** packages/db/src/drizzle/schema/vocabulary-card.ts */
import { sql } from "drizzle-orm"
import { check, date, foreignKey, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { VOCABULARY_MASTERED_STAGE } from "@repo/domain"

import { timestamps } from "./columns"
import { users } from "./user"

/**
 * 単語帳のカード（復習の状態）。1 ユーザー・1 見出し語で 1 行。初めて答えたときに作る
 *
 * 表と裏の中身（語句・1 文・意味）は持たず、出すたびに attempt_word_lookups / passage_glossary_entries から組み立てる。
 * 列の正本は docs/spec/vocabulary-cards/README.md の「必要な DB 設計」。
 * users の削除で cascade する。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const vocabularyCards = pgTable(
  "vocabulary_cards",
  {
    id: serial("id").primaryKey(),
    /**
     * 次に出す日（users.timezone での日付）。段階 4（覚えた単語）は NULL
     */
    dueDate: date("due_date", { mode: "string" }),
    lastReviewedAt: timestamp("last_reviewed_at", { mode: "date", precision: 3 }).notNull(),
    /**
     * 見出し語の小文字（normalizeVocabularyLemma）
     */
    lemma: text("lemma").notNull(),
    /**
     * 0〜4（VOCABULARY_MASTERED_STAGE）
     */
    stage: smallint("stage").notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "vocabulary_cards_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("vocabulary_cards_user_id_lemma_key").on(table.userId, table.lemma),
    /**
     * 今日の復習（due_date <= 今日）を引くため
     */
    index("vocabulary_cards_user_id_due_date_idx").on(table.userId, table.dueDate),
    check("vocabulary_cards_lemma_check", sql`${table.lemma} = lower(${table.lemma})`),
    check("vocabulary_cards_stage_check", sql`${table.stage} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`),
    /**
     * 次に出す日が無いのは覚えた単語だけ
     */
    check(
      "vocabulary_cards_due_date_check",
      sql`(${table.stage} = ${VOCABULARY_MASTERED_STAGE}) = (${table.dueDate} IS NULL)`,
    ),
  ],
)
```

```typescript
/** packages/db/src/drizzle/schema/vocabulary-review.ts */
import { sql } from "drizzle-orm"
import { check, date, foreignKey, index, integer, pgTable, serial, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { VOCABULARY_GRADES, VOCABULARY_MASTERED_STAGE, VOCABULARY_MAX_CARD_SECONDS } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"
import { users } from "./user"
import { vocabularyCards } from "./vocabulary-card"

/**
 * 単語帳の 1 枚ごとの答え。学習記録の集計（学習した日・学習時間）と、答えの保存の冪等の判定に使う
 *
 * 列の正本は docs/spec/vocabulary-cards/README.md の「必要な DB 設計」。
 * users と vocabulary_cards の削除で cascade する。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const vocabularyReviews = pgTable(
  "vocabulary_reviews",
  {
    id: serial("id").primaryKey(),
    /**
     * カードを見ていた秒数。クライアントの申告値を 0〜VOCABULARY_MAX_CARD_SECONDS に切り詰めた値
     */
    activeSeconds: smallint("active_seconds").notNull(),
    cardId: integer("card_id").notNull(),
    /**
     * クライアントが作る UUID。通信のやり直しで同じ答えを 2 回反映しないため
     */
    clientReviewId: uuid("client_review_id").notNull(),
    grade: text("grade", { enum: VOCABULARY_GRADES }).notNull(),
    stageAfter: smallint("stage_after").notNull(),
    /**
     * 新しい単語（答える前にカードが無かった）は NULL
     */
    stageBefore: smallint("stage_before"),
    /**
     * 答えた時点の users.timezone での日付。学習記録の日付はこの列で決まる
     */
    studyDate: date("study_date", { mode: "string" }).notNull(),
    userId: integer("user_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "vocabulary_reviews_user_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      columns: [table.cardId],
      foreignColumns: [vocabularyCards.id],
      name: "vocabulary_reviews_card_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * 冪等の判定。ユーザーごとに一意にして、他のユーザーの答えと衝突しないようにする
     */
    uniqueIndex("vocabulary_reviews_user_id_client_review_id_key").on(table.userId, table.clientReviewId),
    /**
     * 学習記録の集計（study_date ごと）
     */
    index("vocabulary_reviews_user_id_study_date_idx").on(table.userId, table.studyDate),
    index("vocabulary_reviews_card_id_idx").on(table.cardId),
    check("vocabulary_reviews_grade_check", sql`${table.grade} IN (${joinSqlValues(VOCABULARY_GRADES)})`),
    check(
      "vocabulary_reviews_active_seconds_check",
      sql`${table.activeSeconds} BETWEEN 0 AND ${VOCABULARY_MAX_CARD_SECONDS}`,
    ),
    check("vocabulary_reviews_stage_after_check", sql`${table.stageAfter} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`),
    check(
      "vocabulary_reviews_stage_before_check",
      sql`${table.stageBefore} IS NULL OR ${table.stageBefore} BETWEEN 0 AND ${VOCABULARY_MASTERED_STAGE}`,
    ),
  ],
)
```

- CHECK の中の定数は、drizzle-kit がマイグレーションの生成時にリテラルとして展開する（`joinSqlValues` と同じ）。生成された SQL で `BETWEEN 0 AND 4` / `BETWEEN 0 AND 60` になっていることを確かめる
- `packages/db/src/drizzle/schema/index.ts` に `export * from "./vocabulary-card"` と `export * from "./vocabulary-review"` を足す（ファイル名順。`./user-goal` の後）

### 6. マイグレーション

```bash
pnpm --filter api db:generate --name vocabulary_cards
```

生成された `packages/db/drizzle/migrations/{timestamp}_vocabulary_cards/migration.sql` を目で確かめる。

- `vocabulary_cards` / `vocabulary_reviews` の 2 テーブルだけで、他のテーブルへの差分が混ざっていない（混ざっていたら main の取り込み漏れ）
- CHECK が `"stage" BETWEEN 0 AND 4`、`"active_seconds" BETWEEN 0 AND 60`、`"grade" IN ('remembered', 'forgot')`、`("stage" = 4) = ("due_date" IS NULL)` と、定数がリテラルに展開されている
- unique index が `vocabulary_cards (user_id, lemma)` と `vocabulary_reviews (user_id, client_review_id)`
- FK が 3 本（`vocabulary_cards.user_id`・`vocabulary_reviews.user_id`・`vocabulary_reviews.card_id`）で、どれも `ON DELETE cascade`

### 7. アカウント削除の一覧

ユーザーに紐づくテーブルが増えるので、次の 3 か所に `vocabulary_cards` / `vocabulary_reviews` を足す（`test/repository/user-delete-cascade.test.ts` が、users から cascade でたどれるテーブルと一覧が一致することを確かめている）。

- `apps/api/test/controller/user-owned-data.ts` の `USER_OWNED_TABLES`（テストデータの入れ方と数え方。`vocabulary_reviews` はカードの後に入れる）
- `apps/api/test/repository/user-delete-cascade.test.ts` の期待するテーブルの一覧（名前順）
- [github-auth の README の「アカウント削除の処理」](../../github-auth/README.md#アカウント削除の処理) の表

### 8. ビルド

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/db build
```

## 動作確認

### `@repo/domain` のテスト

`packages/domain/test/rules/vocabulary.test.ts` を新設する（既存の `learning-record.test.ts` と同じ書き方）。

```typescript
/** packages/domain/test/rules/vocabulary.test.ts */
import { VOCABULARY_MASTERED_STAGE, VOCABULARY_REVIEW_INTERVAL_DAYS } from "../../src/const/vocabulary"
import { isVocabularyGrade, normalizeVocabularyLemma, scheduleVocabularyReview } from "../../src/rules/vocabulary"

describe("scheduleVocabularyReview", () => {
  const TODAY = "2026-10-14"

  describe("正常系", () => {
    /**
     * 新しい単語（null）と段階 0〜3 の「覚えた」。3 日後 → 7 日後 → 30 日後 → 覚えた単語
     */
    it.each([
      [null, 1, "2026-10-17"],
      [0, 1, "2026-10-17"],
      [1, 2, "2026-10-21"],
      [2, 3, "2026-11-13"],
      [3, 4, null],
    ])("段階 %s で覚えたなら段階 %d・次は %s", (stageBefore, stage, dueDate) => {
      expect(scheduleVocabularyReview(stageBefore, "remembered", TODAY)).toEqual({ dueDate, stage })
    })

    it.each([null, 0, 1, 2, 3])("段階 %s でまだなら段階 0・翌日", (stageBefore) => {
      expect(scheduleVocabularyReview(stageBefore, "forgot", TODAY)).toEqual({ dueDate: "2026-10-15", stage: 0 })
    })

    it("月末をまたいでも日付で数える", () => {
      expect(scheduleVocabularyReview(2, "remembered", "2026-12-15")).toEqual({ dueDate: "2027-01-14", stage: 3 })
    })
  })

  describe("異常系", () => {
    it("覚えた単語（段階 4）で覚えたなら段階 4 のまま", () => {
      expect(scheduleVocabularyReview(4, "remembered", TODAY)).toEqual({ dueDate: null, stage: 4 })
    })

    it("覚えた単語（段階 4）でまだなら段階 0 に戻る", () => {
      expect(scheduleVocabularyReview(4, "forgot", TODAY)).toEqual({ dueDate: "2026-10-15", stage: 0 })
    })
  })

  it("覚えた単語の段階は間隔の数と同じ（片方だけ変えていない）", () => {
    expect(VOCABULARY_MASTERED_STAGE).toBe(VOCABULARY_REVIEW_INTERVAL_DAYS.length)
  })
})

describe("normalizeVocabularyLemma", () => {
  it.each([
    ["Effect", "effect"],
    ["  opt out of ", "opt out of"],
    ["re-render", "re-render"],
  ])("%j は %j", (lemma, expected) => {
    expect(normalizeVocabularyLemma(lemma)).toBe(expected)
  })
})

describe("isVocabularyGrade", () => {
  it.each([
    ["remembered", true],
    ["forgot", true],
    ["skip", false],
    ["", false],
  ])("%j は %s", (value, expected) => {
    expect(isVocabularyGrade(value)).toBe(expected)
  })
})
```

```bash
pnpm --filter @repo/domain test
pnpm --filter api db:migrate
pnpm --filter api test   # test DB にもマイグレーションが流れ、既存のテストが通る
pnpm build
pnpm lint:fix
```

- [ ] `@repo/domain` のテストが通る
- [ ] `db:migrate` が成功し、`\d vocabulary_cards` / `\d vocabulary_reviews` で列・unique index・index・FK（`ON DELETE CASCADE`）・CHECK が見える
- [ ] `pnpm --filter api test` が既存のテストを含めて通る（`cleanupTestData` の TRUNCATE 対象に新しいテーブルが自動で入る）
- [ ] `pnpm build` が通る

### psql で制約を確かめる

dev DB で確かめ、最後に消す。

```bash
docker exec -it tech-english-postgres psql -U postgres -d tech-english_dev
```

```sql
INSERT INTO users (name, updated_at) VALUES ('vocabulary-check', now()) RETURNING id;
\set id <返った id>
INSERT INTO vocabulary_cards (user_id, lemma, stage, due_date, last_reviewed_at, updated_at)
  VALUES (:id, 'opt out of', 1, '2026-10-17', now(), now()) RETURNING id;                 -- 成功
\set card <返った id>
INSERT INTO vocabulary_cards (user_id, lemma, stage, due_date, last_reviewed_at, updated_at)
  VALUES (:id, 'opt out of', 0, '2026-10-15', now(), now());                              -- unique 違反で失敗
INSERT INTO vocabulary_cards (user_id, lemma, stage, due_date, last_reviewed_at, updated_at)
  VALUES (:id, 'Effect', 0, '2026-10-15', now(), now());                                  -- lemma の CHECK 違反で失敗
INSERT INTO vocabulary_cards (user_id, lemma, stage, due_date, last_reviewed_at, updated_at)
  VALUES (:id, 'resilient', 4, '2026-10-15', now(), now());                               -- due_date の CHECK 違反で失敗
INSERT INTO vocabulary_cards (user_id, lemma, stage, due_date, last_reviewed_at, updated_at)
  VALUES (:id, 'resilient', 5, NULL, now(), now());                                       -- stage の CHECK 違反で失敗
INSERT INTO vocabulary_reviews (user_id, card_id, client_review_id, grade, stage_before, stage_after, active_seconds, study_date, updated_at)
  VALUES (:id, :card, '7f1c1f9e-3c1f-4b8a-9d55-0a4c1d2e3f40', 'remembered', NULL, 1, 8, '2026-10-14', now());  -- 成功
INSERT INTO vocabulary_reviews (user_id, card_id, client_review_id, grade, stage_before, stage_after, active_seconds, study_date, updated_at)
  VALUES (:id, :card, '7f1c1f9e-3c1f-4b8a-9d55-0a4c1d2e3f40', 'forgot', 1, 0, 5, '2026-10-14', now());         -- unique 違反で失敗
INSERT INTO vocabulary_reviews (user_id, card_id, client_review_id, grade, stage_before, stage_after, active_seconds, study_date, updated_at)
  VALUES (:id, :card, gen_random_uuid(), 'skip', 1, 0, 5, '2026-10-14', now());                               -- grade の CHECK 違反で失敗
INSERT INTO vocabulary_reviews (user_id, card_id, client_review_id, grade, stage_before, stage_after, active_seconds, study_date, updated_at)
  VALUES (:id, :card, gen_random_uuid(), 'forgot', 1, 0, 61, '2026-10-14', now());                            -- active_seconds の CHECK 違反で失敗
DELETE FROM users WHERE id = :id;
SELECT count(*) FROM vocabulary_cards WHERE user_id = :id;                                -- 0（cascade）
SELECT count(*) FROM vocabulary_reviews WHERE user_id = :id;                              -- 0（cascade）
```

- [ ] 上のコメントどおりの結果になる
- [ ] Repository のテスト（候補の取得・upsert・冪等・cascade）は [step2](./step2-api-vocabulary-session.md)・[step3](./step3-api-vocabulary-review.md) で書く
