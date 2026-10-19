# step6-mobile-question-translation

mobile の解答画面（設問シート）と結果画面で、設問ごとの「訳」で設問文と選択肢の和訳を英文の下に出す。解答中に和訳を出した設問を数えて提出に入れ、結果画面に出す。web（step5）と同じ挙動。仕様と理由は [README](../README.md#解答画面での見せ方)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/mobile/src/components/features/attempt/QuestionTranslationToggle.tsx`（新規） | 設問の「訳」のボタン（設問シートと結果画面で共有） |
| `apps/mobile/src/components/features/attempt/QuestionSheet.tsx` | 「訳」と、設問文・選択肢の下の和訳 |
| `apps/mobile/src/components/features/attempt/SolvingScreen.tsx` | 和訳を出している設問と一度でも出した設問の状態、途中保存、提出 |
| `apps/mobile/src/features/attempt/attempt-progress.ts` | 途中保存に `translatedQuestionIds` |
| `apps/mobile/src/components/features/attempt/ResultScreen.tsx`・`ResultQuestionItem.tsx`・`ResultHeader.tsx` | 設問ごとの「訳」、アシストの使用に「設問の和訳 N 問」 |
| `apps/mobile/src/libs/mock-data.ts`・`app/mock/attempts/[id]/index.tsx`・`app/mock/attempts/[id]/result.tsx` | デザインモックに同じ表示 |

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
    <Pressable
      accessibilityLabel={isTranslated ? "設問の和訳を隠す" : "設問の和訳を表示"}
      accessibilityRole="button"
      accessibilityState={{ selected: isTranslated }}
      hitSlop={8}
      style={[styles.button, isTranslated && styles.buttonActive]}
      onPress={onToggle}
    >
      <Text style={[styles.text, isTranslated && styles.textActive]}>訳</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  buttonActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.5)",
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
  },
  textActive: {
    color: THEME_COLORS.amber,
  },
})
```

- 見た目は段落の「訳」（`PassageReader.tsx` の `BlockRow` の `translateButton`）と同じ。段落の「訳」より薄くしない（`opacity` を下げない。設問は 1 つずつしか見えず、置き場所を探させないため）

### `QuestionSheet.tsx`

props を足す。`memo` しているので、`onToggleTranslation` は呼び出し元で `useCallback` にする（毎秒のタイマーの描画で作り直さない）。

```tsx
  /**
   * 和訳を出している設問の ID
   */
  translatedQuestionIds: Set<number>
  onToggleTranslation: (questionId: number) => void
```

```tsx
  const question = questions[currentIndex]
  const isTranslated = question !== undefined && question.prompt_ja !== null && translatedQuestionIds.has(question.id)
```

```tsx
        {question && (
          <ScrollView key={question.id} contentContainerStyle={styles.questionBody} style={styles.questionScroll}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionLabel}>Q{currentIndex + 1}</Text>
              {question.prompt_ja !== null && (
                <QuestionTranslationToggle isTranslated={isTranslated} onToggle={() => onToggleTranslation(question.id)} />
              )}
            </View>
            <Text style={styles.prompt}>{question.prompt}</Text>
            {isTranslated && <Text style={styles.promptTranslation}>{question.prompt_ja}</Text>}
```

選択肢の英文の `Text` を `View` で包み、その下に和訳を出す。

```tsx
                  <View style={styles.choiceTexts}>
                    <Text style={styles.choiceText}>{choice}</Text>
                    {isTranslated && question.choices_ja !== null && (
                      <Text style={styles.choiceTranslation}>{question.choices_ja[choiceIndex]}</Text>
                    )}
                  </View>
```

```ts
  choiceTexts: {
    flex: 1,
  },
  choiceTranslation: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  promptTranslation: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  questionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
```

- `choiceText` の `flex: 1` は `choiceTexts` に移す
- 和訳は端末の日本語の字体のまま（段落の和訳と同じ。`fontFamily` を付けない）

### `attempt-progress.ts`

web（step5）と同じく `translatedQuestionIds?: number[]` を足し、`isAttemptProgress` に同じ検査を足す（版は上げない）。

### `SolvingScreen.tsx`

- `restoreProgress` で、この挑戦の和訳のある設問の ID だけを残す（web と同じ式）
- 状態 `translatedQuestions` / `viewedTranslationQuestions`（`useState<Set<number>>(() => new Set())`）。hydrate の effect で `setViewedTranslationQuestions(new Set(saved.translatedQuestionIds))`
- `toggleQuestionTranslation` は web と同じ（`useCallback`、依存なし）
- `progressRef.current` に `translatedQuestionIds: [...viewedTranslationQuestions]`、保存の effect の依存配列に `viewedTranslationQuestions`
- `buildSubmitInput()` に `translated_question_count: viewedTranslationQuestions.size`
- `QuestionSheet` に `translatedQuestionIds={translatedQuestions}` と `onToggleTranslation={toggleQuestionTranslation}`
- 解答中のアシストの数は mobile では出さない（今も段落の和訳・単語の数を出していないため）

### 結果画面

- `ResultScreen.tsx`：状態 `translatedQuestionIds` と `toggleQuestionTranslation`（保存も記録もしない）。`ResultQuestionItem` に `isTranslated` と `onToggleTranslation` を渡す
- `ResultQuestionItem.tsx`：開いたときの設問文の行に `QuestionTranslationToggle`、設問文の下に和訳、`ChoiceRow` に `translation: string | null` を足して英文の下に和訳（解答画面と同じ見た目）
- `ResultHeader.tsx` のアシストの使用

```tsx
          <Text style={styles.metricSmall}>和訳 {result.translated_block_count} 段落</Text>
          <Text style={styles.metricSmall}>設問の和訳 {result.translated_question_count} 問</Text>
          <Text style={styles.metricSmall}>単語 {result.word_lookup_count} 回</Text>
          <Text style={styles.metricSmall}>読み上げ {result.listened_block_count} 段落</Text>
```

### デザインモック

- `libs/mock-data.ts` に web と同じ和訳を足す
- 解答画面のモック（設問シートの中）と結果画面のモックに、同じ「訳」と和訳の表示を足す（`QuestionTranslationToggle` を使う）

## 動作確認

iOS シミュレーターが無い環境では、Expo の web 表示で確かめる（choice-sound の step2 と同じ手順。`app.json` の `web.output` を一時的に `single` にし、api の `FRONTEND_URL` を Expo の web のポートにする。確かめたら元に戻す）。シミュレーター・実機があればそちらで確かめる。

- 設問シートの `Q1` の右に「訳」が出る。押すと設問文と 4 つの選択肢の下に和訳が出て、もう一度押すと消える
- 語義の設問は設問文の下にだけ和訳が出る
- 和訳を出したまま設問を移って戻ると、和訳が出たまま。和訳を出していても選択肢を選べる（ポキンも鳴る）
- アプリを開き直して（web 表示では再読み込みして）から提出しても、和訳を出した設問の数が減らない
- 提出すると、結果画面のアシストの使用に「設問の和訳 N 問」が出る。結果画面の設問の「訳」でも和訳が出る
- 和訳の無い設問には「訳」が出ない
- console のエラーが 0 件
- スクショを `docs/screenshots/question-translation/mobile-after.png` に撮る
- `pnpm --filter mobile lint` と型チェック（`pnpm --filter mobile exec tsc --noEmit`。mobile に型チェックの script は無い）が通る
- 確かめるために作った挑戦は dev DB から消す
