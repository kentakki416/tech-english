# step6-web-mypage-vocabulary

web のマイページの学習カレンダーに単語帳を出す。単語帳だけの日もマスに色が付き（step4 で API が単語帳の時間を含めた段階を返す）、ツールチップと選んだ日の一覧に単語帳の枚数を出す。

## 前提

- [step4-api-learning-record-vocabulary](./step4-api-learning-record-vocabulary.md)（カレンダーの日ごとの `card_count` / `remembered_count`）
- [step5-web-vocabulary](./step5-web-vocabulary.md)（`/vocabulary`）
- 見た目は README の「UI 設計」（`design-mock` で確定）に従う
- 既存の実装：[learning-record step4-web-mypage](../../learning-record/tasks/step4-web-mypage.md)（`src/components/features/learning-record/StudyCalendar.tsx`）

## 対応内容

`src/components/features/learning-record/StudyCalendar.tsx` を変える。型は `GetUserCalendarResponse["days"][number]` のままで、step4 で足した `card_count` / `remembered_count` が入る。

### 1. 1 日の要約の文言

挑戦だけ・単語帳だけ・両方の日で文言を作る関数を `src/libs/format.ts` に足す（マスのツールチップ・`aria-label`・選んだ日の見出しで共有する）。

```typescript
/**
 * 学習カレンダーの 1 日の要約。「1 問、単語 12 枚、7 分」のように、0 の項目は出さない。学習していない日は空文字
 */
export const formatStudyDaySummary = (day: { attempt_count: number, card_count: number, study_seconds: number }): string => {
  const items = [
    day.attempt_count > 0 ? `${day.attempt_count} 問` : null,
    day.card_count > 0 ? `単語 ${day.card_count} 枚` : null,
  ].filter((item): item is string => item !== null)
  if (items.length === 0) return ""
  return [...items, formatStudyMinutes(day.study_seconds)].join("、")
}
```

### 2. マスのツールチップと読み上げのラベル

| 場所 | 今 | 変更後 |
| --- | --- | --- |
| 年表示のマスの `title` | `10月10日（土）：1 問、5 分` | `10月10日（土）：1 問、単語 12 枚、7 分`（`formatStudyDaySummary`。学習していない日は日付だけ） |
| 年表示のマスの `aria-label` | `10月10日（土） 1 問 5 分` | 同じ要約を使う |
| 月表示のマスの `aria-label` | `10月10日（土） 1 問` | 同じ要約を使う |
| 月表示のマスの数 | `1 問` | 変えない（狭いので問題数だけ。単語帳だけの日は色だけ付く） |

### 3. 選んだ日

- 見出しの右の要約を `formatStudyDaySummary` にする（`1 問、単語 12 枚、7 分`）
- 挑戦の一覧の後に、`card_count > 0` の日だけ単語帳の 1 行を足す：「単語帳　12 枚（覚えた 9）」。行を押すと `/vocabulary`
- **単語帳だけの日**（`attempt_count === 0` かつ `card_count > 0`）は、挑戦の取得を今と同じく飛ばし、「この日の学習はありません。」を出さずに単語帳の行だけを出す
- 学習していない日（両方 0）は今のまま「この日の学習はありません。」

```tsx
{selectedDay !== undefined && selectedDay.card_count > 0 && (
  <li>
    <Link className="…" href="/vocabulary">
      <span className="…">単語帳</span>
      <span className="…">{selectedDay.card_count} 枚（覚えた {selectedDay.remembered_count}）</span>
    </Link>
  </li>
)}
```

### 4. 凡例と learning-record の README

- 凡例の「色の濃さは学習時間（5 分 / 15 分 / 30 分で段階が変わります）」は変えない（学習時間に単語帳が入るだけ）
- learning-record の README の「UI 設計 > 学習カレンダー」のツールチップと「選んだ日の挑戦」の説明を、上の表示に書き換える

## 動作確認

```bash
pnpm --filter web lint
pnpm build
```

Playwright MCP で確かめる（認証は `verify-web-page` skill の手順）。前もって、ある日に挑戦だけ・別の日に単語帳だけ・今日に両方を作っておく（dev DB の `vocabulary_reviews` に `study_date` を変えて入れてよい）。

- [ ] `/` に着地し、コンソールのエラーが 0 件
- [ ] 単語帳だけの日のマスに色が付き、ツールチップが「単語 12 枚、2 分」
- [ ] 両方の日のツールチップが「1 問、単語 12 枚、7 分」、挑戦だけの日は今と同じ「1 問、5 分」
- [ ] 単語帳だけの日を選ぶと、「この日の学習はありません。」ではなく単語帳の行が出て、押すと `/vocabulary`
- [ ] 両方の日を選ぶと、挑戦の一覧の後に単語帳の行が出る
- [ ] 単語帳だけで今日まで続けた日数が「連続学習日数」に入っている
- [ ] 週の目標が学習時間なら単語帳の時間が進捗に入り、問題数なら入らない
- [ ] 1440px と 390px で崩れない

PR には before / after のスクリーンショット（マイページの学習カレンダーと選んだ日）を入れる。
