# step4-admin-question-translation

admin の問題の確認・修正で設問の和訳を入力できるようにし、ダッシュボードの「アシストの利用率」に設問の和訳を足す。仕様と理由は [README](../README.md#admin-での修正と公開の条件)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/admin/src/components/features/passage/QuestionsTab.tsx` | 設問文の和訳・選択肢の和訳の入力 |
| `apps/admin/src/components/features/stats/AssistCard.tsx` | 「設問の和訳」の横棒 |
| `apps/admin/src/libs/format-stats.ts`・`features/stats/stats.labels.ts` | 問題ごとの成績・問題の分析の「アシスト」の列に設問の和訳 |

### 設問タブ

設問文（英語）の下に「設問文（和訳）」を置く。

```tsx
                  <div>
                    <label className={labelClass} htmlFor={`prompt-${key}`}>設問文（英語）</label>
                    <textarea
                      className={textareaClass}
                      id={`prompt-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, prompt: event.target.value }))}
                      rows={2}
                      value={question.prompt}
                    />
                    <label className={`${labelClass} mt-3`} htmlFor={`prompt-ja-${key}`}>設問文（和訳）</label>
                    <textarea
                      className={textareaClass}
                      id={`prompt-ja-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, prompt_ja: event.target.value }))}
                      rows={2}
                      value={question.prompt_ja ?? ""}
                    />
                  </div>
```

各選択肢の英語の入力の下に、和訳の入力を置く。語義の設問は和訳の入力を出さず、選択肢の一覧の下に注記を出す。

```tsx
const updateChoiceTranslation = (question: PassageFormQuestion, choiceIndex: number, value: string): PassageFormQuestion => {
  const choicesJa = question.choices_ja ?? question.choices.map(() => "")
  return { ...question, choices_ja: choicesJa.map((current, index) => (index === choiceIndex ? value : current)) }
}
```

選択肢ごとの今の行（ラジオ・記号・英語の入力・検証モデルの回答の `flex` の `div`）を `space-y-1.5` の `div` で包み、その下に和訳の入力を足す。

```tsx
                        {question.type !== "vocabulary" && (
                          <input
                            aria-label={`選択肢 ${CHOICE_LETTERS[choiceIndex]} の和訳`}
                            className={`${inputClass} ml-10 h-9 w-[calc(100%-2.5rem)]`}
                            onChange={(event) => updateQuestion(key, (current) => updateChoiceTranslation(current, choiceIndex, event.target.value))}
                            placeholder="和訳"
                            value={question.choices_ja?.[choiceIndex] ?? ""}
                          />
                        )}
```

選択肢の一覧の下（今の「保存時に選択肢の順番は変えません」の注記の上）に、語義の設問だけ注記を出す。

```tsx
                  {question.type === "vocabulary" && <p className={hintClass}>語義の設問は選択肢を訳しません（和訳から答えが分かってしまうため）。</p>}
```

- 選択肢の見出しを「選択肢（ラジオで正解を選ぶ。下の行は和訳）」にする
- 和訳の入力の左端は英語の入力の左端にそろえる（ラジオと記号の幅のぶん下げる。`ml-10` は実装時に見た目で合わせる）
- 種類を語義に変えても、フォームの `choices_ja` は消さない（保存で api が NULL にする。種類を戻したときに入力が残る）
- 公開の検査の違反（`prompt_translation_missing` / `choice_translation_missing`）は、今の設問文・選択肢の違反と同じく、メッセージの一覧に出すだけにする（入力の枠は赤くしない）

### ダッシュボード

`AssistCard.tsx`

```ts
const ASSISTS: { key: keyof AssistRates, label: string }[] = [
  { key: "translated", label: "段落の和訳" },
  { key: "translated_question", label: "設問の和訳" },
  { key: "looked_up", label: "単語の意味" },
  { key: "listened", label: "読み上げ" },
]
```

`format-stats.ts`

```ts
export const formatAssistRates = (rates: {
  listened: number | null
  looked_up: number | null
  translated: number | null
  translated_question: number | null
}): string =>
  `${formatRate(rates.translated)} / ${formatRate(rates.translated_question)} / ${formatRate(rates.looked_up)} / ${formatRate(rates.listened)}`
```

- コメントの並びの説明を「和訳 / 設問訳 / 単語 / 読み上げ」にする
- `stats.labels.ts` の `assistRates` を `"アシスト（和訳 / 設問訳 / 単語 / 読み上げ）"` にする
- デザインモック（`app/(dashboard)/mock/**`）は変えない（モックのデータの型は API と別で、ダッシュボードの見た目は横棒が 1 本増えるだけのため）

### 仕様書

`docs/spec/question-generation/README.md` の「問題の確認・修正」の「設問（数）」と、`docs/spec/admin-dashboard/README.md` の「アシストの利用率」は、この設計の PR で直してある。実装と食い違いが出たら直す。

## 動作確認

`verify-web-page` skill の手順で admin（port 3030）を開く（`/api/dev/login` でログイン）。

- step1 の seed で入れたサンプルの下書きを開き、設問タブで和訳が表示される。語義の設問は選択肢の和訳の入力が無く、注記が出る
- 和訳を書き換えて保存し、開き直すと書き換えた値が出る
- 設問文の和訳を空にして公開すると、「Q1：設問文の和訳が空です」が出て公開できない
- 種類を語義に変えて保存すると、DB の `choices_ja` が NULL になる
- ダッシュボードと問題ごとの成績に「設問の和訳」の利用率が出る（設問の和訳を使った挑戦が無ければ 0%）
- console のエラーが 0 件
- before / after のスクショを `docs/screenshots/question-translation/admin-{before,after}.png` に撮る
- `pnpm --filter admin build` と `pnpm lint` が通る
