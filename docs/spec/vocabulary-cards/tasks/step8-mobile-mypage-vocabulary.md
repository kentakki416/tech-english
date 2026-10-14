# step8-mobile-mypage-vocabulary

mobile のマイページの学習カレンダーに単語帳を出す。web の [step6](./step6-web-mypage-vocabulary.md) と同じ表示を、読み上げのラベルと選んだ日の一覧に入れる。

## 前提

- [step4-api-learning-record-vocabulary](./step4-api-learning-record-vocabulary.md)（カレンダーの日ごとの `card_count` / `remembered_count`）
- [step7-mobile-vocabulary](./step7-mobile-vocabulary.md)（単語帳のタブ）
- web の [step6-web-mypage-vocabulary](./step6-web-mypage-vocabulary.md)（文言をそろえる）
- 既存の実装：[learning-record step5-mobile-mypage](../../learning-record/tasks/step5-mobile-mypage.md)（`src/components/features/learning-record/StudyCalendar.tsx`）

## 対応内容

### 1. 1 日の要約の文言

web と同じ `formatStudyDaySummary` を `src/libs/format.ts` に足す（web と mobile で 1 つずつ持つのは、既存の `formatStudyMinutes` と同じ方針。[learning-record の集計の方法](../../learning-record/README.md#集計の方法)）。

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

### 2. 読み上げのラベル

`src/components/features/learning-record/StudyCalendar.tsx`：

| 場所 | 今 | 変更後 |
| --- | --- | --- |
| 年表示のマスの `accessibilityLabel` | `10月10日（土） 1 問 5 分` | `10月10日（土） 1 問、単語 12 枚、7 分`（学習していない日は日付だけ） |
| 月表示のマスの `accessibilityLabel` | `10月10日（土） 1 問` | 同じ要約 |

### 3. 選んだ日

- 見出しの右の要約（今は `attempt_count > 0` のときだけ `1 問、5 分`）を、`formatStudyDaySummary` が空でなければ出す
- 挑戦の一覧の後に、`card_count > 0` の日だけ「単語帳　12 枚（覚えた 9）」の行を足す。押すと単語帳のタブへ（マイページもタブなので `router.navigate("/vocabulary")`）
- 単語帳だけの日は、挑戦の取得を飛ばし（今の `isKnownEmptyDay` の判定に `card_count === 0` を足す）、「この日の学習はありません。」を出さずに単語帳の行だけを出す

## 動作確認

```bash
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile exec expo export --platform ios
pnpm --filter mobile exec expo export --platform android
```

Expo web（port 8085、Dev Login）と iOS シミュレーターで、web の step6 と同じデータ（挑戦だけの日・単語帳だけの日・両方の日）を使って確かめる。

- [ ] 単語帳だけの日のマスに色が付く
- [ ] 単語帳だけの日を選ぶと、単語帳の行が出て、押すと単語帳のタブへ移る
- [ ] 両方の日を選ぶと、挑戦の一覧の後に単語帳の行が出る
- [ ] VoiceOver でマスを読むと「1 問、単語 12 枚、7 分」のように読まれる
- [ ] 単語帳だけで続けた日数が連続学習日数に入っている
