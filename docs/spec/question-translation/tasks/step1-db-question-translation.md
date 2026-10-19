# step1-db-question-translation

`questions` に設問文と選択肢の和訳の列を、`reading_attempts` に和訳を出した設問の数の列を足す。サンプルの問題（`seed-sample-passages.ts`）にも和訳を入れ、dev で画面を確かめられるようにする。仕様と理由は [README](../README.md#データの持ち方)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/db/src/drizzle/schema/question.ts` | `promptJa` / `choicesJa` と CHECK 制約 `questions_choices_ja_check` |
| `packages/db/src/drizzle/schema/reading-attempt.ts` | `translatedQuestionCount` |
| `packages/db/drizzle/migrations/<timestamp>_add_question_translations/` | `db:generate` の出力 |
| `packages/domain/src/types/question.ts` | `Question` に `promptJa` / `choicesJa` |
| `packages/domain/src/types/attempt.ts` | `ReadingAttempt` に `translatedQuestionCount` |
| `apps/api/src/repository/drizzle/passage-repository.ts`・`reading-attempt-repository.ts` | 行から domain への変換に新しい列を足す（型を通すためだけ。使うのは step3） |
| `apps/api/test/fixture/passage-content.ts`・`test/service/attempt-service/fixtures.ts` ほか | domain の型を組み立てている fixture に新しい項目を足す |
| `packages/db/drizzle/seed-sample-passages.ts` | サンプルの設問に `promptJa` / `choicesJa` |

列の正本（question-generation・reading-practice の「必要な DB 設計」）は、この設計の PR で直してある。

### `schema/question.ts`

```ts
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    choices: jsonb("choices").$type<string[]>().notNull(),
    choicesJa: jsonb("choices_ja").$type<string[]>(),
    correctChoiceIndex: smallint("correct_choice_index").notNull(),
    // ...
    prompt: text("prompt").notNull(),
    promptJa: text("prompt_ja"),
    // ...
  },
  (table) => [
    // ...
    check(
      "questions_choices_ja_check",
      sql`${table.choicesJa} IS NULL OR ${table.type} <> 'vocabulary'`,
    ),
  ],
)
```

- テーブルの先頭のコメント「設問文と選択肢は英語、解説は日本語」を、和訳の列を含む説明に直す
- `choicesJa` には `choices` と同じ順であること、`vocabulary` では NULL であることを、`promptJa` / `choicesJa` には NULL が「和訳が無い（この機能より前に生成した設問）」であることを書く

### `schema/reading-attempt.ts`

```ts
    translatedBlockCount: smallint("translated_block_count").notNull().default(0),
    translatedQuestionCount: smallint("translated_question_count").notNull().default(0),
```

- 「和訳を一度でも出した設問の数（docs/spec/question-translation/README.md）」と書く

### マイグレーション

```bash
pnpm --filter @repo/db db:generate --name add_question_translations
pnpm --filter api db:migrate
```

生成された SQL が次の 4 つだけであることを確かめる（既存の行は NULL / 0 になり、データの移行は無い）。

```sql
ALTER TABLE "questions" ADD COLUMN "choices_ja" jsonb;
ALTER TABLE "questions" ADD COLUMN "prompt_ja" text;
ALTER TABLE "reading_attempts" ADD COLUMN "translated_question_count" smallint DEFAULT 0 NOT NULL;
ALTER TABLE "questions" ADD CONSTRAINT "questions_choices_ja_check" CHECK ("questions"."choices_ja" IS NULL OR "questions"."type" <> 'vocabulary');
```

test DB には `pnpm --filter api test` が流す前に適用する。

### domain の型

`packages/domain/src/types/question.ts`

```ts
export type Question = {
  id: number
  choices: string[]
  choicesJa: string[] | null
  // ...
  prompt: string
  promptJa: string | null
  // ...
}
```

- 先頭のコメント「設問文と選択肢は英語、解説は日本語」を、和訳を含む説明に直す（DB のスキーマと同じ書き方）

`packages/domain/src/types/attempt.ts`

```ts
  translatedBlockCount: number
  /**
   * 和訳を一度でも出した設問の数
   */
  translatedQuestionCount: number
```

### 型を組み立てている箇所

domain の型を変えると、api で `Question` / `ReadingAttempt` を組み立てている箇所が型エラーになる。この step では値をそのまま写すだけにする（使い方は step3）。

- `apps/api/src/repository/drizzle/passage-repository.ts` の `convertQuestionRowToDomain`：`choicesJa: row.choicesJa`、`promptJa: row.promptJa`
- `apps/api/src/repository/drizzle/reading-attempt-repository.ts` の `convertReadingAttemptRowToDomain`：`translatedQuestionCount: row.translatedQuestionCount`
- テストの fixture（`test/fixture/passage-content.ts` の `buildQuestions`、`test/service/attempt-service/fixtures.ts` の `buildAttempt` など）：`choicesJa: null`、`promptJa: null`、`translatedQuestionCount: 0`

漏れは `pnpm --filter api build`（`tsc`）と `pnpm --filter api lint` の型エラーで見つける。

### `seed-sample-passages.ts`

```ts
type SampleQuestion = {
  choices: string[]
  choicesJa: string[] | null
  correctChoiceIndex: number
  evidence: { blockIndex: number; quote: string }
  explanationJa: string
  prompt: string
  promptJa: string
  targetSurface: string | null
  type: QuestionType
  verificationChoiceIndex: number | null
}

const QUESTION_MAIN_IDEA: SampleQuestion = {
  choices: [
    "To explain how React compares dependencies internally",
    "To describe when Effects are appropriate and how to use them correctly",
    "To argue that Effects should never be used in React components",
    "To introduce third-party widgets that work well with React",
  ],
  choicesJa: [
    "React が依存配列を内部でどう比べるかを説明するため",
    "エフェクトが適している場面と、正しい使い方を説明するため",
    "React のコンポーネントでエフェクトを決して使うべきでないと主張するため",
    "React とうまく連携するサードパーティのウィジェットを紹介するため",
  ],
  // ...
  prompt: "What is the main purpose of this passage?",
  promptJa: "この文章の主な目的は何か。",
  // ...
}

const QUESTION_DETAIL: SampleQuestion = {
  // ...
  choicesJa: [
    "依存配列が空のエフェクトの中",
    "エフェクトのクリーンアップ関数の中",
    "イベントハンドラの中",
    "別の state 変数の中",
  ],
  promptJa: "本文によると、ユーザーがボタンをクリックしたために実行されるロジックはどこに置くべきか。",
}

const QUESTION_VOCABULARY: SampleQuestion = {
  // ...
  choicesJa: null,
  promptJa: "第 1 段落の \"escape hatch\" に最も意味が近いものはどれか。",
}

const QUESTION_INFERENCE: SampleQuestion = {
  // ...
  choicesJa: [
    "各レンダーにかかる時間を測るため",
    "本番環境でエフェクトを速く動かすため",
    "後片付けをしないエフェクトを見つけ出すため",
    "コンポーネント間で state を同期させるため",
  ],
  promptJa: "開発中に React がコンポーネントを 2 回マウントするのはなぜか。",
}
```

- `verifySampleQuestions` に次の検査を足す：`promptJa` が空でない、`vocabulary` は `choicesJa === null`、それ以外は `choicesJa` が 4 つで空が無い
- `questionValues` に `choicesJa: question.choicesJa` と `promptJa: question.promptJa` を足す（`onConflictDoUpdate` の `set` にも入るので、seed を流し直せば既存のサンプルにも和訳が入る）

## 動作確認

```bash
pnpm --filter @repo/db build
pnpm --filter api db:seed:sample-passages
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -At -c \
  "SELECT q.type, q.prompt_ja IS NOT NULL, q.choices_ja IS NOT NULL FROM questions q JOIN passages p ON p.id = q.passage_id WHERE p.title LIKE 'Synchronizing%' ORDER BY q.passage_id, q.order_index"
```

- サンプルの設問は `prompt_ja` が入り、`choices_ja` は `vocabulary` だけ NULL
- seed 以外の既存の設問は `prompt_ja` / `choices_ja` が NULL、既存の挑戦は `translated_question_count = 0`
- CHECK 制約：`UPDATE questions SET choices_ja = '["a","b","c","d"]' WHERE type = 'vocabulary'` が `questions_choices_ja_check` で失敗する
- `pnpm build` と `pnpm lint` が通る（domain の型を足したことで、型を組み立てている箇所の漏れが型エラーで見つかる）
- `pnpm --filter api test` が通る（DB の列が増え、fixture に初期値を足しただけなので、挙動は変わらない）
