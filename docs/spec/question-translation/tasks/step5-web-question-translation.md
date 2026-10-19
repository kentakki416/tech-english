# step5-web-question-translation

web の解答画面と結果画面で、設問ごとの「訳」で設問文と選択肢の和訳を英文の下に出す。解答中に和訳を出した設問を数えて提出に入れ、ステータスバーと結果画面に出す。仕様と理由は [README](../README.md#解答画面での見せ方)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/web/src/components/features/attempt/QuestionTranslationToggle.tsx`（新規） | 設問の「訳」のボタン（解答画面と結果画面で共有） |
| `apps/web/src/components/features/attempt/QuestionPanel.tsx` | 「訳」と、設問文・選択肢の下の和訳 |
| `apps/web/src/components/features/attempt/SolvingScreen.tsx` | 和訳を出している設問と一度でも出した設問の状態、途中保存、提出、ステータスバー |
| `apps/web/src/features/attempt/attempt-progress.ts` | 途中保存に `translatedQuestionIds` |
| `apps/web/src/components/features/attempt/ResultScreen.tsx` | 設問ごとの「訳」、アシストの使用に「設問の和訳 N 問」 |
| `apps/web/src/libs/mock-data.ts`・`app/mock/attempts/[id]/SolvingScreen.tsx`・`app/mock/attempts/[id]/result/ResultScreen.tsx` | デザインモックに同じ表示 |

### `QuestionTranslationToggle.tsx`

```tsx
export function QuestionTranslationToggle({
  isTranslated,
  onToggle,
}: {
  isTranslated: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-label={isTranslated ? "設問の和訳を隠す" : "設問の和訳を表示"}
      aria-pressed={isTranslated}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-ui text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
        isTranslated ? "border-amber/50 bg-amber-wash text-amber" : "border-line-strong text-fg-muted hover:text-fg"
      }`}
      onClick={onToggle}
      type="button"
    >
      訳
    </button>
  )
}
```

- 見た目は段落の「訳」（`PassageReader.tsx` の `ReaderBlock`）と同じ。段落の「訳」と違い、ホバーしなくても常に出す（設問は 1 つずつしか見えず、置き場所を探させないため）

### `QuestionPanel.tsx`

props を足す。

```tsx
  translatedQuestionIds: Set<number>
  onToggleTranslation: (questionId: number) => void
```

- `translatedQuestionIds` の JSDoc に「和訳を出している設問の ID」と書く

```tsx
  const isTranslated = question.prompt_ja !== null && translatedQuestionIds.has(question.id)
```

```tsx
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">Q{currentIndex + 1}</p>
          {question.prompt_ja !== null && (
            <QuestionTranslationToggle isTranslated={isTranslated} onToggle={() => onToggleTranslation(question.id)} />
          )}
        </div>
        <h2 className="mt-2 font-reading text-[17px] leading-relaxed text-fg">{question.prompt}</h2>
        {isTranslated && <p className="mt-1.5 font-ui text-[14px] leading-relaxed text-fg-muted">{question.prompt_ja}</p>}
```

選択肢のボタンの中の英文を縦に並べる。

```tsx
                  <span className="flex flex-col pt-px">
                    <span className="font-reading text-[15.5px] leading-snug text-fg">{choice}</span>
                    {isTranslated && question.choices_ja !== null && (
                      <span className="mt-1 font-ui text-[13px] leading-snug text-fg-muted">{question.choices_ja[choiceIndex]}</span>
                    )}
                  </span>
```

- 和訳は IBM Plex Sans JP（`font-ui`）で、英文より小さく薄くする（英文を主にして見比べられるように）
- 語義の設問は `choices_ja` が null なので、設問文の下にだけ出る

### `attempt-progress.ts`

```ts
  translatedQuestionIds?: number[]
```

- JSDoc に「和訳を一度でも出した設問の ID。設問の和訳より前の版で保存したものには無い」と書く。版を上げない理由は `listenedBlockIndexes` のコメントにあるので繰り返さない

`isAttemptProgress` に `listenedBlockIndexes` と同じ形の検査を足す。

```ts
    && (value.translatedQuestionIds === undefined
      || (Array.isArray(value.translatedQuestionIds) && value.translatedQuestionIds.every(id => typeof id === "number")))
```

### `SolvingScreen.tsx`

`restoreProgress` で、この挑戦の和訳のある設問の ID だけを残す。

```ts
  const translatableQuestionIds = new Set(attempt.questions.flatMap(question => (question.prompt_ja !== null ? [question.id] : [])))
```

```ts
    translatedQuestionIds: [...new Set(saved.translatedQuestionIds ?? [])].filter(id => translatableQuestionIds.has(id)),
```

状態と切り替え。

```ts
  const [translatedQuestions, setTranslatedQuestions] = useState<Set<number>>(() => new Set())
  const [viewedTranslationQuestions, setViewedTranslationQuestions] = useState<Set<number>>(() => new Set(savedProgress?.translatedQuestionIds))

  const toggleQuestionTranslation = useCallback((questionId: number) => {
    setTranslatedQuestions((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
    setViewedTranslationQuestions(current => (current.has(questionId) ? current : new Set(current).add(questionId)))
  }, [])
```

- 2 つの集合に付けるコメントは段落の和訳（`translatedBlocks` / `viewedTranslationBlocks`）と同じ書き方にする（「いま和訳を出している設問」「和訳を一度でも出した設問（提出の translated_question_count）」）
- 途中保存の `useEffect` に `translatedQuestionIds: [...viewedTranslationQuestions]` と依存配列の `viewedTranslationQuestions`
- `submit()` の body に `translated_question_count: viewedTranslationQuestions.size`
- `QuestionPanel` を置いている 2 か所（PC 幅の `<aside>` とスマホ幅の `QuestionSheet` の中）の両方に `translatedQuestionIds={translatedQuestions}` と `onToggleTranslation={toggleQuestionTranslation}` を渡す
- ステータスバーの「和訳 N 段落」の後ろに足す

```tsx
          <span className="tabular-nums">設問訳 {viewedTranslationQuestions.size} 問</span>
```

### `ResultScreen.tsx`

- 状態 `translatedQuestionIds`（`useState<Set<number>>`）と、`toggleQuestion` と同じ形の `toggleQuestionTranslation` を足す（保存も記録もしない）
- 開いた設問の設問文の行を `flex` にし、右に `QuestionTranslationToggle` を置く（見出しの行は開閉のボタンなので、その中には置けない）。和訳は設問文の下に解答画面と同じ見た目で出す
- `ChoiceRow` に `translation: string | null` を足し、英文の下に出す（`isTranslated && question.choices_ja !== null ? question.choices_ja[choiceIndex] : null` を渡す）
- アシストの使用

```tsx
                  和訳 {result.translated_block_count} 段落
                  <p className="text-fg">設問の和訳 {result.translated_question_count} 問</p>
                  <p className="text-fg">単語 {result.word_lookup_count} 回</p>
                  <p className="text-fg">読み上げ {result.listened_block_count} 段落</p>
```

### デザインモック

- `libs/mock-data.ts` の `MockQuestion` に `choicesJa` / `promptJa`、`MOCK_QUESTIONS` に和訳（語義の設問は `choicesJa: null`）、`MOCK_RESULT` に `translatedQuestionCount`
- 解答画面のモックのローカルの `QuestionPanel` と結果画面のモックに、同じ「訳」と和訳の表示を足す（`QuestionTranslationToggle` を使う）

### 仕様書

`docs/spec/reading-practice/README.md` の UI 設計（設問パネル・ステータスバー・結果画面）は、この設計の PR で直してある。実装と食い違いが出たら直す。

## 動作確認

`verify-web-page` skill の手順で web（port 3000）の解答画面と結果画面を確かめる。step1 の seed のサンプルの問題（公開）を使う。

- 設問パネルの `Q1` の右に「訳」が出る。押すと設問文と 4 つの選択肢の下に和訳が出て、もう一度押すと消える
- 語義の設問（`escape hatch`）は設問文の下にだけ和訳が出る
- 和訳を出したまま別の設問に移って戻ると、和訳が出たまま
- 和訳を出していても、選択肢のクリックと `1`〜`4` で選べる
- ステータスバーの「設問訳 N 問」が、和訳を出した設問の数だけ増える（同じ設問を何度押しても 1）
- 再読み込みしても「設問訳 N 問」が減らない
- スマホ幅（設問シート）でも同じに動く
- 提出すると、結果画面のアシストの使用に「設問の和訳 N 問」が出る。結果画面の設問の「訳」でも和訳が出る
- dev DB の `reading_attempts.translated_question_count` が提出した値になる
- 和訳の無い設問（step1 より前に生成した dev DB の問題）には「訳」が出ない
- console のエラーが 0 件
- スクショを `docs/screenshots/question-translation/web-{before,after,after-result}.png` に撮る（before は実装前に main で撮る）
- `pnpm --filter web build` と `pnpm lint` が通る
- 確かめるために作った挑戦は dev DB から消す
