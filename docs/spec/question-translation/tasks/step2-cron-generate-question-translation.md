# step2-cron-generate-question-translation

問題の生成（`generate:questions`）で、設問と同じ呼び出しで設問文と選択肢の和訳も作らせ、選択肢と同じ順にシャッフルして保存する。仕様と理由は [README](../README.md#生成)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/cron/src/prompt/generate-questions-schema.ts` | 設問に `promptJa` / `choicesJa`、`choicesJa` は `vocabulary` のときだけ null |
| `apps/cron/src/prompt/generate-questions.ts` | system prompt に和訳の指示、`PROMPT_VERSION` を上げる |
| `apps/cron/src/lib/question-generation/shuffle-choices.ts` | `choicesJa` も同じ順に並べ替える |
| `apps/cron/src/lib/question-generation/build-draft-content.ts` | 下書きの設問に `promptJa` / `choicesJa` |
| `apps/cron/src/repository/passage-repository.ts`・`drizzle/passage-repository.ts` | `DraftQuestion` と `saveDraft` の insert に `promptJa` / `choicesJa` |
| `apps/cron/test/**` | テストと送信内容のスナップショット |

### `generate-questions-schema.ts`

```ts
export const generatedQuestionSchema = z.object({
  choices: z
    .array(z.string().trim().min(1))
    .length(QUESTION_CHOICE_COUNT)
    .describe("Exactly 4 answer choices in English. Exactly one is correct"),
  choicesJa: z
    .array(z.string().trim().min(1))
    .length(QUESTION_CHOICE_COUNT)
    .nullable()
    .describe("Japanese translations of choices in the same order. null for vocabulary questions"),
  correctChoiceIndex: z.number().int().min(0).max(QUESTION_CHOICE_COUNT - 1).describe("0-based index of the correct choice"),
  evidence: z.object({
    blockIndex: blockIndexSchema,
    quote: z.string().min(1).describe("Verbatim excerpt from the block text that supports the answer"),
  }),
  explanationJa: z.string().min(1).describe("Explanation in Japanese"),
  prompt: z.string().min(1).describe("Question text in English"),
  promptJa: z.string().trim().min(1).describe("Japanese translation of prompt"),
  type: z.enum(QUESTION_TYPES),
  vocabularyTarget: blockRefSchema
    .nullable()
    .describe("The target word or phrase for vocabulary questions. null for other types"),
})
```

`generateQuestionsOutputSchema` の `superRefine` に、`vocabularyTarget` と同じ形で `choicesJa` の検査を足す。

```ts
    if (isVocabulary !== (question.choicesJa === null)) {
      ctx.addIssue({
        code: "custom",
        message: isVocabulary
          ? "choicesJa must be null for vocabulary questions"
          : "choicesJa is required for non-vocabulary questions",
        path: ["questions", index, "choicesJa"],
      })
    }
```

- `superRefine` の中のコメント「vocabulary の設問だけが対象語句を持つ」を、選択肢の和訳を持たないことも含めた説明にする
- 不合格の理由はそのまま再生成の指示（`retryErrors`）になる（今の仕組みのまま）

### `generate-questions.ts`

冒頭の説明の「multiple-choice questions」を「multiple-choice questions with Japanese translations」にし、「# 3. Questions」を次のとおりに変える。

```text
- Write prompt and choices in English, and promptJa, choicesJa and explanationJa in Japanese.
```

```text
- promptJa and choicesJa: Japanese translations for learners who cannot follow the English question. Write them the same way as the block translations (see "4. Translations"). choicesJa[i] is the translation of choices[i]. Translate each choice faithfully: do not add, drop or soften anything, so that no choice becomes more or less convincing in Japanese than in English.
- For vocabulary questions, keep the target word or phrase in English in promptJa exactly as it appears in prompt, and do not explain its meaning. Set choicesJa to null, because translated choices would give the answer away.
```

- 2 つ目と 3 つ目は「explanationJa: ...」の箇条の後ろに置く
- `PROMPT_VERSION` を実装した日の日付に上げる

### `shuffle-choices.ts`

```ts
export type QuestionChoices = {
  choices: string[]
  choicesJa: string[] | null
  correctChoiceIndex: number
}

export const shuffleChoices = (input: QuestionChoices, random: () => number): QuestionChoices => {
  const order = input.choices.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = current
  }
  const { choices, choicesJa } = input
  return {
    choices: order.map((originalIndex) => choices[originalIndex]),
    choicesJa: choicesJa === null ? null : order.map((originalIndex) => choicesJa[originalIndex]),
    correctChoiceIndex: order.indexOf(input.correctChoiceIndex),
  }
}
```

- 関数のコメントに「`choicesJa` も `choices` と同じ順に並べ替える（null はそのまま）」を足す

### `build-draft-content.ts`

```ts
    const shuffled = shuffleChoices(
      { choices: question.choices, choicesJa: question.choicesJa, correctChoiceIndex: question.correctChoiceIndex },
      input.random,
    )
    const draftQuestion: Omit<DraftQuestion, "targetGlossaryIndex"> = {
      choices: shuffled.choices,
      choicesJa: shuffled.choicesJa,
      correctChoiceIndex: shuffled.correctChoiceIndex,
      evidenceBlockIndex: question.evidence.blockIndex,
      evidenceQuote: question.evidence.quote,
      explanationJa: question.explanationJa,
      orderIndex: index,
      prompt: question.prompt,
      promptJa: question.promptJa,
      type: question.type,
      verificationChoiceIndex: null,
    }
```

- `buildDraftContent` のコメントの手順 5 を「選択肢と選択肢の和訳を同じ順にシャッフルして、正解の位置を無作為にする」にする
- 要確認の理由は足さない（和訳はスキーマで必須なので、合格した出力には必ずある）

### repository

`apps/cron/src/repository/passage-repository.ts`

```ts
export type DraftQuestion = Pick<
  Question,
  | "choices"
  | "choicesJa"
  | "correctChoiceIndex"
  | "evidenceBlockIndex"
  | "evidenceQuote"
  | "explanationJa"
  | "orderIndex"
  | "prompt"
  | "promptJa"
  | "type"
  | "verificationChoiceIndex"
> & { targetGlossaryIndex: number | null }
```

`apps/cron/src/repository/drizzle/passage-repository.ts` の `saveDraft` の `tx.insert(questions).values(...)` に `choicesJa: question.choicesJa` と `promptJa: question.promptJa` を足す。

### 仕様書

`docs/spec/question-generation/README.md` の [LLM の呼び出し](../../question-generation/README.md#llm-の呼び出し) の出力の表は、この設計の PR で `promptJa` / `choicesJa` を足してある。実装と食い違いが出たら直す。

## 動作確認

### テスト

`pnpm --filter cron test`（DB 不要）。

| ファイル | 足すケース |
| --- | --- |
| `test/lib/question-generation/helpers.ts` | `buildQuestion` に `promptJa` / `choicesJa`、語義の設問は `choicesJa: null` |
| `test/lib/question-generation/shuffle-choices.test.ts` | 引数を `{ choices, choicesJa, correctChoiceIndex }` に直す。`choicesJa` が `choices` と同じ順に並ぶ（`choicesJa[i]` が `choices[i]` の訳のまま）、`choicesJa` が null なら null のまま、引数の配列を変えない |
| `test/prompt/generate-questions-schema.test.ts` | 語義の設問で `choicesJa` があると `["questions", i, "choicesJa"]` の issue、語義以外で null だと同じ path の issue、`promptJa` が空白だけだと issue、`choicesJa` が 3 つだと issue |
| `test/lib/question-generation/validate-generated-output.test.ts` | 語義の設問に `choicesJa` があると不合格で、理由が `questions.1.choicesJa: choicesJa must be null for vocabulary questions` |
| `test/lib/question-generation/build-draft-content.test.ts` | 下書きの設問の `choicesJa[i]` が、シャッフル後の `choices[i]` の訳を指す（helpers の英文と和訳の組で確かめる）。`promptJa` がそのまま入る。語義の設問は `choicesJa: null` |
| `test/repository/drizzle/passage-repository.test.ts` | `saveDraft` の insert の値に `promptJa` / `choicesJa` が入る |

送信内容のスナップショット（`test/prompt/__snapshots__/generate-questions.prompt.txt`）は `pnpm --filter cron test -u` で更新し、差分が system prompt の和訳の指示と JSON Schema の `promptJa` / `choicesJa` だけであることを確かめる。

### 実際の生成

ローカルの dev DB で 1 件だけ生成し、出力を確かめる（Claude API の費用がかかるので 1 件だけにする）。

```bash
pnpm --filter cron generate:questions --passage-id=<collected の本文候補の id>
docker exec -i tech-english-postgres psql -U postgres -d "tech-english_dev" -At -c \
  "SELECT type, prompt, prompt_ja, choices, choices_ja, correct_choice_index FROM questions WHERE passage_id = <id> ORDER BY order_index"
```

- 全設問に `prompt_ja` があり、語義の設問だけ `choices_ja` が NULL
- `choices_ja[i]` が `choices[i]` の訳になっている（シャッフルでずれていない）
- 語義の設問の `prompt_ja` に対象の語句が英語のまま残り、意味が書かれていない
- `passages.generation_prompt_version` が新しい `PROMPT_VERSION`
