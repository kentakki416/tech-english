# step3-api-question-translation

api で設問の和訳を扱う。

- admin：問題の詳細・保存で和訳を扱い、公開の条件に足す
- 挑戦：設問に和訳を渡し、和訳を出した設問の数を提出で受け取って保存する
- 学習記録とダッシュボード：アシストの判定と利用率に入れる

仕様と理由は [README](../README.md#api)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `packages/schema/src/api-schema/admin/passage.ts` | 詳細の設問と保存のリクエストの設問に `prompt_ja` / `choices_ja` |
| `packages/schema/src/api-schema/attempt.ts` | `attemptQuestionSchema` に `prompt_ja` / `choices_ja`、提出済みの挑戦と提出のリクエストに `translated_question_count` |
| `packages/schema/src/api-schema/learning-record.ts` | `used_assist` のコメントに設問の和訳 |
| `packages/schema/src/api-schema/admin/stats.ts` | `assistRatesSchema` に `translated_question` |
| `apps/api/src/lib/admin-passage-edit.ts` | 保存の入力に和訳、空白・語義の設問の和訳を NULL にする |
| `apps/api/src/controller/admin/passage/convert-detail-to-response.ts` | 詳細のレスポンスと保存のリクエストの変換 |
| `apps/api/src/repository/passage-repository.ts` | `DraftEditContent.questions` に `choicesJa` / `promptJa` |
| `apps/api/src/lib/passage-publish-check.ts` | `prompt_translation_missing` / `choice_translation_missing` |
| `apps/api/src/service/attempt-service.ts`・`controller/attempt/mapper.ts`・`controller/attempt/submit.ts` | 設問の和訳、`translated_question_count` の受け取りと上限 |
| `apps/api/src/repository/reading-attempt-repository.ts`・`drizzle/reading-attempt-repository.ts` | `markSubmitted` に `translatedQuestionCount` |
| `apps/api/src/service/learning-record-service.ts`・`repository/learning-record-repository.ts`・`drizzle/learning-record-repository.ts` | アシストの判定に `translatedQuestionCount` |
| `apps/api/src/repository/drizzle/admin-stats-repository.ts`・`service/admin-stats-service.ts`・`controller/admin/stats/convert-stats-to-response.ts` | 設問の和訳を使った挑戦の数と利用率 |
| `apps/admin/src/features/passage/passage.form.ts`・`components/features/passage/QuestionsTab.tsx` | 保存のリクエストに和訳をそのまま渡す、新しい設問の初期値（入力の UI は step4） |

### スキーマ

`packages/schema/src/api-schema/attempt.ts`

```ts
export const attemptQuestionSchema = z.object({
  id: z.number().int(),
  choices: z.array(z.string()).length(4),
  /**
   * 選択肢の和訳（choices と同じ順）。和訳の無い設問と、文脈での語義の設問は null
   */
  choices_ja: z.array(z.string()).length(4).nullable(),
  order_index: z.number().int(),
  prompt: z.string(),
  /**
   * 設問文の和訳。和訳の無い設問（docs/spec/question-translation/README.md の「これまでの問題」）は null
   */
  prompt_ja: z.string().nullable(),
  type: z.enum(QUESTION_TYPES),
})
```

`submittedAttemptSchema` に足す。

```ts
  translated_block_count: z.number().int(),
  /**
   * 和訳を一度でも出した設問の数
   */
  translated_question_count: z.number().int(),
```

`submitAttemptRequestSchema` に足す。

```ts
  /**
   * 和訳を一度でも出した設問の数。サーバーが設問の数で上限をかける。
   * 古いアプリ（送ってこない版）のために省略時は 0
   */
  translated_question_count: z.number().int().nonnegative().default(0),
```

`packages/schema/src/api-schema/admin/passage.ts`

```ts
      choices_ja: z.array(z.string()).nullable(),
      prompt_ja: z.string().nullable(),
```

```ts
        choices_ja: z.array(z.string().max(1000)).length(QUESTION_CHOICE_COUNT).nullable(),
        prompt_ja: z.string().max(1000).nullable(),
```

- 上が詳細のレスポンスの設問、下が保存のリクエストの設問。長さの上限は英語の `choices` / `prompt` と同じ

`packages/schema/src/api-schema/admin/stats.ts`

```ts
const assistRatesSchema = z.object({
  listened: rateSchema,
  looked_up: rateSchema,
  translated: rateSchema,
  translated_question: rateSchema,
})
```

`packages/schema/src/api-schema/learning-record.ts` の `used_assist` のコメントを「段落の和訳・設問の和訳・単語の意味・読み上げのどれかを 1 回以上使った」にする。

スキーマを変えたら `pnpm --filter @repo/api-schema build`。

### admin の保存

`apps/api/src/lib/admin-passage-edit.ts`

```ts
  questions: {
    id: number | null
    choices: string[]
    choicesJa: string[] | null
    // ...
    prompt: string
    promptJa: string | null
    // ...
  }[]
```

```ts
const convertBlankTranslationToNull = (translation: string | null): string | null =>
  translation === null || translation.trim() === "" ? null : translation

const convertBlankChoiceTranslationsToNull = (translations: string[] | null): string[] | null =>
  translations === null || translations.every((translation) => translation.trim() === "") ? null : translations
```

```ts
    return {
      id: question.id,
      choices: question.choices,
      choicesJa: question.type === "vocabulary" ? null : convertBlankChoiceTranslationsToNull(question.choicesJa),
      // ...
      prompt: question.prompt,
      promptJa: convertBlankTranslationToNull(question.promptJa),
      targetGlossaryIndex,
      type: question.type,
    }
```

- `choicesJa` を語義の設問で NULL にする理由（DB の `questions_choices_ja_check`、種類を語義に変えたときに残った和訳を消す）は `convertBlankChoiceTranslationsToNull` を呼ぶ行の上に書く
- 一部だけ空白の `choicesJa` はそのまま保存する（途中の状態も保存でき、正しさは公開の検査で見る。保存のリクエストのスキーマのコメントと同じ方針）

`apps/api/src/repository/passage-repository.ts` の `DraftEditContent.questions` の `Pick` に `"choicesJa" | "promptJa"` を足す。`updateDraftContent` は残りの列をスプレッドして insert / update しているので、drizzle 側の変更は要らない。

`apps/api/src/controller/admin/passage/convert-detail-to-response.ts`

```ts
      choices_ja: question.choicesJa,
      prompt_ja: question.promptJa,
```

```ts
      choicesJa: question.choices_ja,
      promptJa: question.prompt_ja,
```

### 公開の条件

`apps/api/src/lib/passage-publish-check.ts`

```ts
const hasChoiceTranslations = (choicesJa: string[] | null): boolean =>
  choicesJa !== null && choicesJa.length === QUESTION_CHOICE_COUNT && choicesJa.every((choice) => !isBlank(choice))
```

```ts
    if (isBlank(question.promptJa)) {
      violations.push({
        code: "prompt_translation_missing",
        message: `${questionLabel}：設問文の和訳が空です`,
        path: ["questions", index, "prompt_ja"],
      })
    }
    if (question.type !== "vocabulary" && !hasChoiceTranslations(question.choicesJa)) {
      violations.push({
        code: "choice_translation_missing",
        message: `${questionLabel}：選択肢の和訳を ${QUESTION_CHOICE_COUNT} つとも入力してください`,
        path: ["questions", index, "choices_ja"],
      })
    }
```

- `explanation_empty` の検査の後ろに置く（メッセージの並びが設問のフォームの上からの順になるように）

### 挑戦

`apps/api/src/service/attempt-service.ts`

```ts
export type AttemptQuestionView = Pick<Question, "id" | "choices" | "choicesJa" | "orderIndex" | "prompt" | "promptJa" | "type">

const buildQuestionView = (question: Question): AttemptQuestionView => ({
  id: question.id,
  choices: question.choices,
  choicesJa: question.choicesJa,
  orderIndex: question.orderIndex,
  prompt: question.prompt,
  promptJa: question.promptJa,
  type: question.type,
})
```

- `SubmittedAttemptView` に `translatedQuestionCount: number`、`buildSubmittedView` に `translatedQuestionCount: attempt.translatedQuestionCount`
- `submitAttempt` の input に `translatedQuestionCount: number`、`markSubmitted` に `translatedQuestionCount: Math.min(input.translatedQuestionCount, content.questions.length)`

`apps/api/src/controller/attempt/submit.ts`：`translatedQuestionCount: body.translated_question_count`

`apps/api/src/controller/attempt/mapper.ts`

```ts
const convertQuestionToResponse = (question: AttemptQuestionView): AttemptQuestion => ({
  id: question.id,
  choices: question.choices,
  choices_ja: question.choicesJa,
  order_index: question.orderIndex,
  prompt: question.prompt,
  prompt_ja: question.promptJa,
  type: question.type,
})
```

`convertSubmittedAttemptToResponse` に `translated_question_count: view.translatedQuestionCount`。

`apps/api/src/repository/reading-attempt-repository.ts` の `SubmitReadingAttemptInput` に `translatedQuestionCount: number`、`drizzle/reading-attempt-repository.ts` の `markSubmitted` の `set` に `translatedQuestionCount: input.translatedQuestionCount`。

### 学習記録

- `repository/learning-record-repository.ts` の `SubmittedAttempt` に `translatedQuestionCount: number`。「アシストなし」の説明のコメントを「translated_block_count = 0 かつ translated_question_count = 0 かつ word_lookup_count = 0 かつ listened_block_count = 0」にする
- `drizzle/learning-record-repository.ts`：一覧の行の変換に `translatedQuestionCount: attempt.translatedQuestionCount`、アシストなしの絞り込みに `eq(readingAttempts.translatedQuestionCount, 0)`
- `service/learning-record-service.ts`

```ts
  usedAssist:
    attempt.translatedBlockCount > 0
    || attempt.translatedQuestionCount > 0
    || attempt.wordLookupCount > 0
    || attempt.listenedBlockCount > 0,
```

### ダッシュボード

`apps/api/src/repository/drizzle/admin-stats-repository.ts`

```sql
  count(*) FILTER (WHERE ra.translated_block_count > 0) AS translated_attempts,
  count(*) FILTER (WHERE ra.translated_question_count > 0) AS translated_question_attempts,
  count(*) FILTER (WHERE ra.word_lookup_count > 0) AS looked_up_attempts,
  count(*) FILTER (WHERE ra.listened_block_count > 0) AS listened_attempts
```

- `ATTEMPT_TOTAL_COLUMNS`・`AttemptTotalsRow`・`convertAttemptTotalsRow`（`translatedQuestionAttempts`）に足す
- `summarizeOverview` の CTE `solved` の列に `ra.translated_question_count`、問題ごとの集計 `_buildPassageStatsSelect` の列に `s.translated_question_attempts` を足す
- `service/admin-stats-service.ts` の `assistRates` に `translatedQuestion: divideOrNull(totals.translatedQuestionAttempts, totals.solvedAttempts)`
- `controller/admin/stats/convert-stats-to-response.ts` に `translated_question: rates.translatedQuestion`

### admin の画面（型を通すためだけ）

保存のリクエストのスキーマに `prompt_ja` / `choices_ja` が増えると admin が型エラーになるので、この step で値を通すところまで直す（入力の UI は step4）。

- `apps/admin/src/features/passage/passage.form.ts` の `convertFormToRequest` に `choices_ja: question.choices_ja` と `prompt_ja: question.prompt_ja`（`PassageFormQuestion` は詳細のレスポンスの型から作っているので、フォームには自動で入る）
- `apps/admin/src/components/features/passage/QuestionsTab.tsx` の `createEmptyQuestion` に `choices_ja: null` と `prompt_ja: null`

これで step4 より前に admin で保存しても、生成した和訳は消えない。

## 動作確認

### テスト

`pnpm --filter api test`（`vitest` を直接実行しない。dev DB が消えるため）。

| ファイル | 足すケース |
| --- | --- |
| `test/lib/passage-publish-check.test.ts` | 設問文の和訳が NULL・空白だけで `prompt_translation_missing`。語義以外で選択肢の和訳が NULL・1 つだけ空白で `choice_translation_missing`。語義の設問は選択肢の和訳が NULL でも違反にならない |
| `test/lib/admin-passage-edit.test.ts` | 空白だけの `promptJa` が NULL になる。語義の設問の `choicesJa` が NULL になる。4 つとも空白の `choicesJa` が NULL になり、一部だけ空白ならそのまま |
| `test/controller/admin/passage/update.test.ts`・`detail.test.ts` | 和訳を保存して詳細で読める。語義の設問に `choices_ja` を送っても NULL で保存される（CHECK 制約に当たらない） |
| `test/controller/admin/passage/publish.test.ts` | 和訳の無い下書きの公開が 400 で、`details` に 2 つの code |
| `test/controller/attempt/start.test.ts`・`detail.test.ts` | 設問に `prompt_ja` / `choices_ja` が入る。和訳の無い設問は両方 null |
| `test/controller/attempt/submit.test.ts`・`test/service/attempt-service/submitAttempt.test.ts` | `translated_question_count` を保存して結果に返す。設問の数を超える値は設問の数に切り詰める。省略すると 0 |
| `test/repository/learning-record-repository.test.ts`・`test/service/learning-record-service/getUserAttempts.test.ts` | 設問の和訳だけを使った挑戦が「アシストあり」で、アシストなしの正答率から外れる |
| `test/repository/admin-stats-repository.test.ts`・`test/service/admin-stats-service/*.test.ts` | 設問の和訳を使った挑戦の数と利用率 |

fixture（`test/fixture/passage-content.ts` の `QUESTION_ITEMS`・`buildEditInput`、`test/controller/admin/passage/fixtures.ts` の `convertDetailResponseToUpdateBody`、`test/service/attempt-service/fixtures.ts` の `EXPECTED_QUESTIONS`、`test/fixture/learning-record.ts` の `createSubmittedAttempt` など）に新しい項目を足す。公開の条件をすべて満たす `buildAdminPassageDetail` は和訳を持たせる。

### 手で確かめる

```bash
pnpm --filter api build && pnpm lint
```

- dev DB でサンプルの問題（step1 の seed）を開始する API を呼び、設問に和訳が入ること（`curl` と `pnpm --filter api issue-test-token <userId>` の token）
