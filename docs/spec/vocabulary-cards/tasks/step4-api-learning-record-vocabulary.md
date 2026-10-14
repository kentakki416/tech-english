# step4-api-learning-record-vocabulary

学習記録の集計に単語帳を足す。単語帳で答えた日も学習した日に数え、単語帳の時間を学習時間に足す。学習カレンダーの API は日ごとに答えた枚数と覚えたの数を返す。あわせて、定義の正本である learning-record の README を書き換える。

## 前提

- [step3-api-vocabulary-review](./step3-api-vocabulary-review.md)（`vocabulary_reviews` に答えが入る）
- 既存の学習記録の API：[learning-record step2-api-user-stats](../../learning-record/tasks/step2-api-user-stats.md)（`LearningRecordRepository`・`learning-record-service.ts`）
- 仕様は README の [学習記録への反映](../README.md#学習記録への反映) と [学習記録の集計の変更](../README.md#学習記録の集計の変更)

## 対応内容

### 1. 何が変わるか

API の形はほぼ保ち、**集計の中身** を変える。サービスの計算（連続学習日数・週の目標・色の段階）は今の集計の結果をそのまま使うので、Repository が単語帳を含めた値を返せば済む。

| 集計 | 使っている所 | 変更 |
| --- | --- | --- |
| `findStudyDates` | 連続学習日数・直近 14 日のマス | 挑戦と単語帳の `study_date` の和集合 |
| `summarizeByDate` | カレンダー・週の目標の進捗 | 日ごとに `cardCount` / `rememberedCount` を足し、`studySeconds` は両方の合計。単語帳だけの日も返す |
| `summarizeTotals` | 累計 | `studySeconds` に単語帳の秒数を足す。他は挑戦だけ |
| `summarizeNoAssistAccuracy` / `summarizeAccuracyByQuestionType` / `findSubmittedAttempts` | 正答率・最近の挑戦・学習履歴 | 変えない |

週の目標は、`passages`（問題数）が `attemptCount` を、`minutes`（学習時間）が `studySeconds` を数えているので、Service を変えなくても「問題数には単語帳を数えず、学習時間には足す」になる。

### 2. Repository

`src/repository/learning-record-repository.ts` の `DailyStudySummary` に 2 つの列を足し、interface のコメントを書き換える。

```typescript
/**
 * 1 日（学習した日）の集計。学習した日は挑戦を提出した日か、単語帳で答えた日（vocabulary-cards README「学習記録への反映」）
 */
export type DailyStudySummary = {
  attemptCount: number
  /**
   * 単語帳で答えた枚数（同じカードに 2 回答えれば 2）
   */
  cardCount: number
  correctCount: number
  /**
   * 学習した日（YYYY-MM-DD）
   */
  date: string
  questionCount: number
  /**
   * 単語帳で「覚えた」を付けた数
   */
  rememberedCount: number
  /**
   * 挑戦のかかった時間と、単語帳でカードを見ていた時間の合計（秒）
   */
  studySeconds: number
}
```

- `LearningRecordRepository` の説明を「数えるのは status = 'submitted' の挑戦と、単語帳の答え（vocabulary_reviews）」に直す。`findStudyDates` / `summarizeByDate` / `summarizeTotals` のコメントにも単語帳を含むことを書く

Drizzle 実装 `src/repository/drizzle/learning-record-repository.ts`。**挑戦と単語帳を別々に集計して、Repository の中で日付で合わせる**（1 本の SQL の `UNION ALL` にすると、挑戦の列と単語帳の列を NULL で埋め合わせる形になり読みにくいため。どちらも `(user_id, study_date)` の index で引ける）。

```typescript
/**
 * 単語帳の答えのうち、そのユーザーの行だけに絞る条件（(user_id, study_date) の index が効く）
 */
const buildReviewCondition = (userId: number) => eq(vocabularyReviews.userId, userId)

public async findStudyDates(userId: number): Promise<string[]> {
  const [attemptRows, reviewRows] = await Promise.all([
    this._db
      .selectDistinct({ studyDate: readingAttempts.studyDate })
      .from(readingAttempts)
      .where(buildSubmittedCondition(userId)),
    this._db
      .selectDistinct({ studyDate: vocabularyReviews.studyDate })
      .from(vocabularyReviews)
      .where(buildReviewCondition(userId)),
  ])
  const dates = new Set([
    ...attemptRows.flatMap((row) => (row.studyDate === null ? [] : [row.studyDate])),
    ...reviewRows.map((row) => row.studyDate),
  ])
  return [...dates].sort()
}

public async summarizeByDate(userId: number, range: { from: string; to: string }): Promise<DailyStudySummary[]> {
  const [attemptRows, reviewRows] = await Promise.all([
    /** …（今の挑戦の集計のまま） */,
    this._db
      .select({
        cardCount: count(),
        date: vocabularyReviews.studyDate,
        rememberedCount: sql<number>`count(*) FILTER (WHERE ${vocabularyReviews.grade} = 'remembered')`.mapWith(Number),
        studySeconds: sql<number>`coalesce(sum(${vocabularyReviews.activeSeconds}), 0)`.mapWith(Number),
      })
      .from(vocabularyReviews)
      .where(
        and(
          buildReviewCondition(userId),
          gte(vocabularyReviews.studyDate, range.from),
          lte(vocabularyReviews.studyDate, range.to),
        ),
      )
      .groupBy(vocabularyReviews.studyDate),
  ])

  const byDate = new Map<string, DailyStudySummary>()
  const findOrCreate = (date: string): DailyStudySummary => {
    const existing = byDate.get(date)
    if (existing) return existing
    const created = { attemptCount: 0, cardCount: 0, correctCount: 0, date, questionCount: 0, rememberedCount: 0, studySeconds: 0 }
    byDate.set(date, created)
    return created
  }
  for (const { date, ...summary } of attemptRows) {
    if (date === null) continue
    Object.assign(findOrCreate(date), summary)
  }
  for (const row of reviewRows) {
    const day = findOrCreate(row.date)
    day.cardCount = row.cardCount
    day.rememberedCount = row.rememberedCount
    day.studySeconds += row.studySeconds
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
```

- `summarizeByDate` の挑戦側を先に流してから単語帳側を足す（挑戦側の `Object.assign` が `studySeconds` を上書きするため、順番を変えない）
- `summarizeTotals` は今のクエリに、`vocabulary_reviews` の `coalesce(sum(active_seconds), 0)` を引くクエリを `Promise.all` で並べ、`studySeconds` に足す
- `vocabularyReviews` は `@repo/db` から import する

### 3. Service

`src/service/learning-record-service.ts` の `getUserCalendar` で、学習していない日の既定値に 2 つの列を足す。他の関数は変えない。

```typescript
return {
  attemptCount: summary?.attemptCount ?? 0,
  cardCount: summary?.cardCount ?? 0,
  correctCount: summary?.correctCount ?? 0,
  date,
  level: convertStudySecondsToLevel(studySeconds),
  questionCount: summary?.questionCount ?? 0,
  rememberedCount: summary?.rememberedCount ?? 0,
  studySeconds,
}
```

- `calculateGoalProgress` のコメント（`minutes は今週の学習秒数 ÷ 60 の切り捨て`）に「単語帳の時間を含む。問題数は挑戦だけ」を足す

### 4. API スキーマと Controller

`packages/schema/src/api-schema/learning-record.ts` の `getUserCalendarResponseSchema` の `days` に足す。

```typescript
days: z.array(
  z.object({
    attempt_count: z.number().int(),
    /**
     * 単語帳で答えた枚数
     */
    card_count: z.number().int(),
    correct_count: z.number().int(),
    date: z.string(),
    level: z.number().int().min(0).max(4),
    question_count: z.number().int(),
    /**
     * 単語帳で「覚えた」を付けた数
     */
    remembered_count: z.number().int(),
    /**
     * 挑戦と単語帳の合計（秒）
     */
    study_seconds: z.number().int(),
  }),
),
```

- `src/controller/user/` のカレンダーの Controller の `days` の変換に `card_count: day.cardCount`・`remembered_count: day.rememberedCount` を足す
- web と mobile はレスポンスを `parse` しているが、`z.object` は知らない列を捨てるので、画面の step（[step6](./step6-web-mypage-vocabulary.md)・[step8](./step8-mobile-mypage-vocabulary.md)）より先にこの step を出しても壊れない

### 5. learning-record の README を書き換える

定義の正本は learning-record にあるので、ここで書き換える。

| 場所 | 変更 |
| --- | --- |
| 冒頭の「関連 spec」 | `vocabulary-cards` を足す（単語帳で答えた日・時間を集計に含める） |
| 仕様 > 学習した日と学習時間 | 学習した日に「または単語帳で 1 枚以上答えた日」、学習時間に「単語帳でカードを見ていた時間」を足す。日付は答えた時点のタイムゾーンで決まることも書く |
| 仕様 > 目標 | 「問題数は提出した挑戦の数で数える（単語帳は数えない）」「学習時間には単語帳の時間を含む」 |
| 仕様 > マイページに出すもの | 累計の学習時間に単語帳を含むこと |
| 設計 > 集計の方法 | 「`reading_attempts` と `vocabulary_reviews` から都度集計し、Repository の中で日付で合わせる」 |
| 必要な API | `GET /api/user/calendar` に `card_count` / `remembered_count` |
| 必要な DB 設計 | 集計元に `vocabulary_reviews`（正本は vocabulary-cards）を足す |

カレンダーのツールチップ・選んだ日の表示は画面の step（step6・step8）で UI 設計とあわせて書き換える。

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm lint:fix
```

Repository のテスト `test/repository/learning-record-repository.test.ts` に足す（単語帳の答えは step2 の `test/fixture/vocabulary.ts` に `insertVocabularyReview(userId, cardId, overrides)` を足して入れる）:

- 正常系
  - [ ] `findStudyDates`：挑戦だけの日・単語帳だけの日・両方の日が重複なしの昇順で返る
  - [ ] `summarizeByDate`：単語帳だけの日が `attemptCount: 0`・`cardCount`・`rememberedCount`・`studySeconds`（単語帳の秒数）で返る
  - [ ] `summarizeByDate`：両方の日の `studySeconds` が挑戦と単語帳の合計、`attemptCount` は挑戦だけ
  - [ ] `summarizeByDate`：期間の境界（`from` / `to` ちょうどの単語帳の答え）が含まれ、外は含まれない
  - [ ] `summarizeTotals`：`studySeconds` に単語帳の秒数が足され、`attemptCount` / `passageCount` は変わらない
- 異常系
  - [ ] 他のユーザーの単語帳の答えは、どの集計にも入らない
  - [ ] 単語帳の答えしか無いユーザーでも `summarizeNoAssistAccuracy` / `summarizeAccuracyByQuestionType` は 0 件のまま

Service のユニットテスト（既存の `test/service/learning-record-service/` に足す）:

- [ ] 単語帳だけの日が続いていても連続学習日数が数えられる（`findStudyDates` の戻り値で決まることの確認）
- [ ] 週の目標が `passages` なら単語帳の枚数を数えず、`minutes` なら単語帳の秒数を含めて達成を判定する（`summarizeByDate` の戻り値に `cardCount` と `studySeconds` を入れて確かめる）
- [ ] `getUserCalendar` の学習していない日が `cardCount: 0`・`rememberedCount: 0`

Controller のインテグレーションテスト（既存の `test/controller/user/` のカレンダー・stats に足す）:

- [ ] 単語帳で答えた日のカレンダーの日が `card_count` / `remembered_count` を持ち、`level` が単語帳の時間を含めた段階になる（`toEqual`）
- [ ] 単語帳だけの日でも `stats.streak.current` が数えられ、`totals.study_seconds` に単語帳の秒数が入る
- [ ] 既存のカレンダー・stats のテストが、`card_count: 0` / `remembered_count: 0` を足した期待値で通る

手動確認：

```bash
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/user/calendar | jq '.days[-1]'
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/user/stats | jq '{streak, totals}'
```

- [ ] step3 で答えた日の `card_count` と `study_seconds` が増え、`streak.recent_days` の今日が学習済みになる
