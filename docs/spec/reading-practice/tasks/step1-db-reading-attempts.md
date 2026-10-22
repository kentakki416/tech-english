# step1-db-reading-attempts

挑戦の記録（`reading_attempts` / `attempt_answers` / `attempt_word_lookups`）と英和辞書（`dictionary_entries`）のテーブル、`@repo/domain` の定数と型、辞書の seed スクリプトを作る。列の定義と制約の理由は [README の必要な DB 設計](../README.md#必要な-db-設計)、辞書は [英和辞書](../README.md#英和辞書)。

## 前提

- [github-auth step1-db-user-timezone](../../github-auth/tasks/step1-db-user-timezone.md)（`users.timezone`）
- [content-collection step1-db-sources](../../content-collection/tasks/step1-db-sources.md)（`passages`）
- [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md)（`questions` / `passage_glossary_entries`）

## 対応内容

### 1. `@repo/domain`

```ts
/** packages/domain/src/const/attempt.ts */
/**
 * 挑戦の状態
 */
export const ATTEMPT_STATUSES = ["in_progress", "submitted", "expired"] as const
/**
 * 調べた単語の出どころ
 */
export const WORD_LOOKUP_SOURCES = ["glossary", "dictionary"] as const
/**
 * 挑戦の有効期限（開始からの秒数）。これを過ぎた in_progress は expired にする
 */
export const ATTEMPT_EXPIRY_SECONDS = 24 * 60 * 60

/** packages/domain/src/const/passage-segment.ts */
/**
 * 本文のセグメントの種類（README「本文のトークン化」）
 */
export const PASSAGE_SEGMENT_KINDS = ["code", "punct", "space", "word"] as const
```

```ts
/** packages/domain/src/types/attempt.ts */
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]
export type WordLookupSource = (typeof WORD_LOOKUP_SOURCES)[number]

/**
 * 挑戦。提出時に採点結果と時間が入る（in_progress / expired の間は null）
 */
export type ReadingAttempt = {
  id: number
  correctCount: number | null
  elapsedSeconds: number | null
  isOvertime: boolean | null
  passageId: number
  questionCount: number | null
  startedAt: Date
  status: AttemptStatus
  /** 提出時のユーザーの TZ での日付（YYYY-MM-DD） */
  studyDate: string | null
  submittedAt: Date | null
  timeLimitSeconds: number
  translatedBlockCount: number
  userId: number
  wordLookupCount: number
  createdAt: Date
  updatedAt: Date
}

export type AttemptAnswer = { id: number; attemptId: number; isCorrect: boolean; questionId: number; selectedChoiceIndex: number | null; createdAt: Date; updatedAt: Date }
export type AttemptWordLookup = { id: number; attemptId: number; glossaryEntryId: number | null; lemma: string; passageId: number; source: WordLookupSource; surface: string; userId: number; createdAt: Date; updatedAt: Date }
export type DictionaryEntry = { id: number; headword: string; meaningJa: string; createdAt: Date; updatedAt: Date }

/** packages/domain/src/types/passage-segment.ts */
export type PassageSegmentKind = (typeof PASSAGE_SEGMENT_KINDS)[number]
```

- `src/rules/attempt.ts` に type guard `isAttemptStatus` / `isWordLookupSource` を置く（`isMembershipTier` と同じ書き方）
- `src/index.ts` に re-export を足す（ファイル名順）

### 2. Drizzle のスキーマ

`packages/db/src/drizzle/schema/` に 1 テーブル 1 ファイルで作り、`index.ts` に足す（ファイル名順）。FK の書き方は既存の `auth-account.ts` に合わせる。

```ts
/** packages/db/src/drizzle/schema/reading-attempt.ts */
export const readingAttempts = pgTable(
  "reading_attempts",
  {
    id: serial("id").primaryKey(),
    correctCount: smallint("correct_count"),
    elapsedSeconds: integer("elapsed_seconds"),
    isOvertime: boolean("is_overtime"),
    passageId: integer("passage_id").notNull(),
    questionCount: smallint("question_count"),
    startedAt: timestamp("started_at", { mode: "date", precision: 3 }).notNull(),
    status: text("status", { enum: ATTEMPT_STATUSES }).notNull().default("in_progress"),
    studyDate: date("study_date", { mode: "string" }),
    submittedAt: timestamp("submitted_at", { mode: "date", precision: 3 }),
    timeLimitSeconds: integer("time_limit_seconds").notNull(),
    translatedBlockCount: smallint("translated_block_count").notNull().default(0),
    userId: integer("user_id").notNull(),
    wordLookupCount: smallint("word_lookup_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "reading_attempts_user_id_fkey" })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ columns: [table.passageId], foreignColumns: [passages.id], name: "reading_attempts_passage_id_fkey" })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check(
      "reading_attempts_status_check",
      sql`${table.status} IN (${sql.join(ATTEMPT_STATUSES.map((status) => sql`${status}`), sql`, `)})`,
    ),
    /** submitted なら採点結果と時間が必ずある */
    check(
      "reading_attempts_submitted_columns_check",
      sql`${table.status} <> 'submitted' OR (${table.submittedAt} IS NOT NULL AND ${table.elapsedSeconds} IS NOT NULL AND ${table.isOvertime} IS NOT NULL AND ${table.questionCount} IS NOT NULL AND ${table.correctCount} IS NOT NULL AND ${table.studyDate} IS NOT NULL)`,
    ),
    uniqueIndex("reading_attempts_user_id_passage_id_in_progress_key")
      .on(table.userId, table.passageId)
      .where(sql`${table.status} = 'in_progress'`),
    index("reading_attempts_user_id_study_date_idx").on(table.userId, table.studyDate),
    index("reading_attempts_user_id_passage_id_idx").on(table.userId, table.passageId),
  ],
)
```

残りの 3 テーブル（列は README の ER 図のとおり。`...timestamps` を末尾に置く）：

| ファイル / テーブル | FK（`onUpdate("cascade")` は共通） | 制約・index |
| --- | --- | --- |
| `attempt-answer.ts` / `attempt_answers` | `attempt_id` → `reading_attempts` **cascade**、`question_id` → `questions` **restrict** | unique `attempt_answers_attempt_id_question_id_key`、CHECK `selected_choice_index IS NULL OR selected_choice_index BETWEEN 0 AND 3` |
| `attempt-word-lookup.ts` / `attempt_word_lookups` | `attempt_id` → `reading_attempts` **cascade**、`user_id` → `users` **cascade**、`passage_id` → `passages` restrict、`glossary_entry_id` → `passage_glossary_entries` **set null** | CHECK `source IN (WORD_LOOKUP_SOURCES)`、index `(user_id, lemma)`・`(attempt_id)` |
| `dictionary-entry.ts` / `dictionary_entries` | なし | unique `dictionary_entries_headword_key`、CHECK `headword = lower(headword)` |

- `glossary_entry_id` を set null にするのは、公開済みの問題を非公開に戻して用語集を編集・削除できるため（[question-generation](../../question-generation/README.md#公開済みの問題を直すとき)）。参照が消えても調べた記録は残す
- `attempt_answers.question_id` の restrict により、挑戦された設問は削除できない。question-generation step5 の保存 API はこの FK 違反を起こさない作り（設問の数を変えない）になっている
- `users` の削除で消えることの確認テストは [github-auth step5](../../github-auth/tasks/step5-api-delete-user.md) が持つ

`packages/db/src/index.ts` の演算子の re-export に、step2〜4 で使う `asc` / `count` / `exists` / `gt` / `inArray` / `isNull` / `lte` / `max` / `notExists` / `or` を足す（アルファベット順）。

### 3. マイグレーション

```bash
pnpm --filter api db:generate
```

生成された SQL を目で確認する：部分 unique index に `WHERE "status" = 'in_progress'` が付いている、CHECK 制約の値が定数どおり、FK の `ON DELETE` が上の表どおり。

### 4. 辞書の seed

`packages/db/drizzle/seed-dictionary.ts` を作り、`packages/db/package.json` に `"db:seed:dictionary": "tsx drizzle/seed-dictionary.ts"`、`apps/api/package.json` に `db:seed` と同じ形の委譲（`dotenvx run -f .env.local -- pnpm --filter @repo/db db:seed:dictionary`）を足す。

```ts
/** packages/db/drizzle/seed-dictionary.ts（要点） */
/**
 * EJDict-hand（https://github.com/kujirahand/EJDict）をコミットを固定して取得する。
 * ライセンス：実装時に取得元の README でパブリックドメインであることを確認し、確認したコミットと文言をここに書く
 */
const EJDICT_COMMIT_SHA = "<実装時に確認したコミット SHA>"
const BATCH_SIZE = 1000

const main = async () => {
  const lines = await fetchEjdictLines(EJDICT_COMMIT_SHA)
  const entries = convertEjdictLinesToEntries(lines)
  for (const batch of chunk(entries, BATCH_SIZE)) {
    await db
      .insert(dictionaryEntries)
      .values(batch)
      .onConflictDoUpdate({ set: { meaningJa: sql`excluded.meaning_ja`, updatedAt: new Date() }, target: dictionaryEntries.headword })
  }
}
```

- 取得：`https://raw.githubusercontent.com/kujirahand/EJDict/{EJDICT_COMMIT_SHA}/...` を `fetch` する。どのファイル（`src/a.txt`〜`z.txt` か、`release/` の UTF-8 版）を使うかと行の形式は、実装時に取得元で確認する
- 変換は純関数 `convertEjdictLinesToEntries(lines): { headword: string; meaningJa: string }[]` を `packages/db/drizzle/ejdict.ts` に分ける
  - 行は `見出し語<TAB>意味`。空行・TAB の無い行は捨てる
  - 見出し語がカンマ区切り（`color,colour` など）なら分けてそれぞれ同じ意味で登録する
  - 見出し語は前後の空白を除いて小文字化する。小文字化で同じ見出し語になったもの（`Polish` / `polish`）は意味を ` / ` でつなげて 1 行にする（`headword` は unique）
- 何度流しても同じ結果になる（upsert）。**本番でも流す**（既存の `seed.ts` と違い `NODE_ENV=production` でスキップしない）。本番は migration イメージを command override で one-shot 起動し、`pnpm --filter @repo/db db:seed:dictionary` を実行する（初回と辞書の版を上げるときだけ）
- `convertEjdictLinesToEntries` のテストは packages/db に vitest が無いため Node 標準の `node:test` で書く（`packages/db/drizzle/ejdict.test.ts`）

## 動作確認

```bash
pnpm --filter @repo/domain build
pnpm --filter api db:generate      # 生成された SQL を確認
pnpm --filter api db:migrate
pnpm build && pnpm lint:fix
pnpm --filter @repo/db exec tsx --test drizzle/ejdict.test.ts
pnpm --filter api db:seed:dictionary
```

- [ ] `convertEjdictLinesToEntries`：カンマ区切りの見出し語を分ける / 大文字の見出し語を小文字にする / 小文字化で重なる見出し語の意味をつなげる / TAB の無い行を捨てる
- [ ] seed を 2 回流しても `SELECT count(*) FROM dictionary_entries` が変わらない（約 4.6 万件）
- [ ] psql で制約を確かめる
  - 同じ `(user_id, passage_id)` に `in_progress` を 2 行入れると unique 違反、片方を `expired` にすると入る
  - `status = 'submitted'` で `study_date` が NULL の行は CHECK 違反
  - `attempt_answers` に同じ `(attempt_id, question_id)` を 2 行入れると unique 違反、`selected_choice_index = 4` は CHECK 違反
  - 回答のある `questions` の行を消すと FK 違反、`reading_attempts` の行を消すと `attempt_answers` / `attempt_word_lookups` も消える
  - `dictionary_entries.headword` に大文字を入れると CHECK 違反
- [ ] 既存のテスト（`pnpm --filter api test`）が通る（`cleanupTestData` は新しいテーブルも TRUNCATE する）
