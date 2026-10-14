# step5-mobile-mypage

mobile のマイページ（タブ `(tabs)/index`）・設定（タブ `(tabs)/settings`）・学習履歴（スタック `history`）を、確定済みのモックから移植してダミーデータを API のデータに置き換える。タブのレイアウト（マイページ / 問題 / 設定）もここで本番に移す。デザインは [README の「mobile の画面」](../README.md#mobile-の画面) と [product-overview の「mobile のデザイン」](../../product-overview/README.md#mobile-のデザイン)。

## 前提

- [step2-api-user-stats](./step2-api-user-stats.md)・[step3-api-user-goal](./step3-api-user-goal.md)
- [github-auth step2-api-auth-github](../../github-auth/tasks/step2-api-auth-github.md)（`GET /api/user` の `timezone`、`PATCH /api/user`）
- [github-auth step4-mobile-github-login](../../github-auth/tasks/step4-mobile-github-login.md)（Bearer と 401 時の refresh を行う API クライアント、ログイン中のユーザー、ログアウト、`expo-localization`）
- [reading-practice step8〜10](../../reading-practice/tasks/step8-mobile-passage-list.md)（問題タブ・タブのレイアウト・共通部品・`passages/random`・結果画面）
- この step の後に [study-reminder step3-mobile-reminder](../../study-reminder/tasks/step3-mobile-reminder.md) が設定画面のリマインダーの区画を、[github-auth step7-mobile-delete-user](../../github-auth/tasks/step7-mobile-delete-user.md) が `settings/delete-account` を作る

## 対応内容

### 移植の対応表

見た目（`StyleSheet` の値・並び・文言）はモックをそのまま使い、`/mock/...` への遷移を本番のルートに、`@/libs/mock-data` の値を API のレスポンスに置き換える。モックは消さない（取り決め 4）。

| 本番 | モック |
| --- | --- |
| `src/app/(tabs)/_layout.tsx`（置き換え） | `src/app/mock/(tabs)/_layout.tsx` |
| `src/app/(tabs)/index.tsx`（メモの一覧を置き換え） | `src/app/mock/(tabs)/home.tsx` |
| `src/app/(tabs)/settings.tsx`（旧 `setting.tsx` は削除） | `src/app/mock/(tabs)/settings.tsx`（リマインダーの区画を除く） |
| `src/app/history.tsx` | `src/app/mock/history.tsx` |
| `src/components/features/learning-record/StudyCalendar.tsx` | `src/components/mock/StudyCalendar.tsx` |
| 同 `StreakPanel.tsx`・`GoalPanel.tsx`・`RecentAttempts.tsx`・`StudyTotals.tsx`・`TypeAccuracy.tsx`・`GoalForm.tsx`・`TimezonePickerModal.tsx` | home / settings の各区画 |
| `src/components/ui/`（`PrimaryButton`・`SecondaryButton`・`Segment`・`Chip`・`ScoreSquares`） | `src/components/mock/parts.tsx` |
| `src/features/learning-record/learning-record.api.ts` | ― |
| `src/libs/format.ts` | `src/libs/mock-data.ts` の `formatSeconds` など |
| `src/components/features/passage/labels.ts`（`QUESTION_TYPE_LABELS`） | `src/libs/mock-data.ts` の設問の種類のラベル |

トークン（`src/const/design-theme.ts` の `THEME_COLORS` / `HEAT_COLORS` / `THEME_FONTS`）・フォントの読み込み・`Wordmark`・`appStyles`・本文リーダーは github-auth step4 が本番に移してある。上の表の共通部品・`format.ts`・`labels.ts`・タブのレイアウトは reading-practice step8 が本番に移してある（[実装の順番](../../product-overview/README.md#実装の順番)）。この step はそれを使い、マイページ・設定のタブの中身を作り、`format.ts` に足りない関数を足す。上の表の行のうち既にあるものは作らない。

### タブとルート

- `(tabs)/_layout.tsx`: モックのタブをそのまま移す（`index` = マイページ・`passages` = 問題・`settings` = 設定、`headerShown: false`、色は `THEME_COLORS`）
- `(tabs)/passages.tsx` とタブのレイアウトは reading-practice step8 が作成済み。この step は `(tabs)/index.tsx`（マイページ）と `(tabs)/settings.tsx`（設定）の仮の画面を置き換える
- 旧 `(tabs)/setting.tsx`（端末内だけのリマインダー）は削除する。`src/hooks/use-notification.ts` は study-reminder step3 が作り直すので残す
- ルートの `_layout.tsx` の Stack に `<Stack.Screen name="history" options={{ headerShown: false }} />` を足す（上部バーは画面が持つ）。メモのタブは無くなるが、`src/app/memo/` と `features/memo/` は消さない（product-overview の「削除するかは別途判断」）

### API の呼び出し（`src/features/learning-record/learning-record.api.ts`）

型とスキーマは `@repo/api-schema` から取る（ローカルに型を定義しない）。HTTP クライアントは github-auth step4 が作る認証付きのもの（以下 `apiClient`）を使う。

```typescript
/**
 * 学習記録と目標の API 通信層
 */
export const learningRecordApi = {
  getAttempts: async (query: { cursor?: number, date?: string } = {}): Promise<GetUserAttemptsResponse> => {
    const { data } = await apiClient.get("/api/user/attempts", { params: query })
    return getUserAttemptsResponseSchema.parse(data)
  },
  /** 範囲を省略すると年表示（直近 53 週）の範囲を api が決める */
  getCalendar: async (range?: { from: string, to: string }): Promise<GetUserCalendarResponse> => { /** 同様 */ },
  getGoal: async (): Promise<GetUserGoalResponse> => { /** 同様 */ },
  getStats: async (): Promise<GetUserStatsResponse> => { /** 同様 */ },
  saveGoal: async (input: UpdateUserGoalRequest): Promise<UpdateUserGoalResponse> => {
    const { data } = await apiClient.put("/api/user/goal", input)
    return updateUserGoalResponseSchema.parse(data)
  },
}
```

- タイムゾーンの変更は `src/features/user/user.api.ts` の `updateTimezone(timezone)`（`PATCH /api/user`）。github-auth step4 で作られていなければ足す
- `src/libs/format.ts` と `labels.ts` は web の step4 と同じ関数・定数（`formatSeconds`・`formatStudyTime`・`formatDayLabel`・`formatDateHeading`・分の切り上げ、`QUESTION_TYPE_LABELS`）を mobile 側に置く（フロント間でコードを共有するパッケージは無い）

### マイページ（`(tabs)/index.tsx`）

- `useFocusEffect` で `learningRecordApi.getStats()` と `getCalendar()` を並列に取得する（問題を解いて戻ったときに反映させるため）。名前とアイコンは github-auth step4 が持つログイン中のユーザー（無ければ `GET /api/user`）。`ScrollView` に `RefreshControl` を付けて引っ張って再取得できるようにする
- 初回の取得中は `ActivityIndicator`、失敗したら「読み込めませんでした。」と「再読み込み」（副ボタン）
- 値の対応・目標のパネルの出し分け・今週の進捗の線と文言・空の状態は web の [step4 の「マイページ」](./step4-web-mypage.md#マイページsrcapppagetsx) と同じ。mobile だけの違い:
  - 上部はロゴ（`Wordmark`）とアイコン（`expo-image` で `avatar_url`。無ければ頭文字）
  - パネル → カレンダー → 累計 → 種類別の順に縦に並べ、最近の挑戦は 3 件（`stats.recent_attempts.slice(0, 3)`）
- 遷移: 「問題一覧」→ `router.navigate("/passages")`、「ランダムに 1 問解く」→ `router.push("/passages/random")`（study-reminder の通知と同じ入口）、「編集」「目標を設定する」→ `router.navigate("/settings")`、「すべて見る」→ `router.push("/history")`、挑戦の行 → `` router.push(`/attempts/${id}/result`) ``

### 学習カレンダー（`StudyCalendar.tsx`）

データの作り方は web の [step4 の「学習カレンダー」](./step4-web-mypage.md#学習カレンダーstudycalendartsxclient-component) と同じ（年表示は `from` の曜日で前を空のマスで埋める、月表示は年のデータから切り出すか `learningRecordApi.getCalendar({ from, to })` で取得、選んだ日は `getAttempts({ date })`）。mobile だけの違い:

- 年表示は曜日のラベルの列を横スクロールの外に固定し、マスだけを `ScrollView horizontal` にする。`onContentSizeChange` で `scrollToEnd({ animated: false })`
- 月表示は 7 列のマスに日付と色のマスだけ（問題数は出さない）。前後の月への移動ボタン（`chevron-back` / `chevron-forward`）を月の見出しの横に足し、今月で「次」を無効にする
- 選んだ日の取得は、日付を素早く切り替えたときに古い結果で上書きしないよう、取得時の日付と現在の `selectedDate` が一致するときだけ state に入れる

### 学習履歴（`history.tsx`）

- 上部バーはモックのまま（「‹ マイページ」で `router.back()`、画面名「学習履歴」）
- `learningRecordApi.getAttempts()` の結果を state に貯め、`study_date` ごとに `SectionList` の section を作る（見出しは `formatDateHeading`）。行はモックの 2 行の並び（提出時刻・タイトル・スコアのマス・正答数・時間〈超過は `wrong` と「超過」〉・アシストの有無）
- `onEndReached` で `next_cursor` があれば続きを取得する（読み込み中は重ねて呼ばない）。行を押すと `` router.push(`/attempts/${id}/result`) ``
- 1 件も無いときは「まだ提出した挑戦はありません。」

### 設定（`(tabs)/settings.tsx`）

区画の順は「目標 → リマインダー → タイムゾーン → アカウント → 危険な操作」（README）。

- **目標**（`GoalForm`）: `useFocusEffect` で `learningRecordApi.getGoal()` を取得して初期値にする（`null` なら空と「設定しない」）
  - 目標日はモックの入力欄を押すと日付の選択を出す。`@react-native-community/datetimepicker` を `npx expo install` で入れる（iOS はモーダルの中に `display="inline"`、Android は標準のダイアログ）。日付が入っているときは横に「日付を消す」を置く（どれも空欄にできるため）
  - 「目標を保存」で本文を組み立てる（`goal_text` は trim して空なら `null`、指標が「設定しない」なら指標と値を `null`）→ `updateUserGoalRequestSchema.safeParse` → 失敗なら「入力内容を確認してください。」（`wrong`）→ `learningRecordApi.saveGoal` → 「目標を保存しました」（`correct`）。保存中はボタンを押せなくする
- **リマインダー**: この step では場所だけ用意する。目標とタイムゾーンの間に `{/** リマインダーの区画は study-reminder step3 がここに入れる */}` を置き、見出しも出さない
- **タイムゾーン**: 現在の値（ログイン中のユーザーの `timezone`）と説明のカード。押すと `TimezonePickerModal`（RN の `Modal`、`presentationStyle="pageSheet"`、上に絞り込みの `TextInput`、下に `FlatList`）を開く（新しいルートは足さない）
  - 候補は `Intl.supportedValuesOf("timeZone")`。Hermes で使えない場合に備え、実装の最初に実機で `typeof Intl.supportedValuesOf === "function"` を確認し、使えなければ web のモックの `TIMEZONES` と端末のタイムゾーン（`expo-localization` の `getCalendars()[0]?.timeZone`）を候補にする
  - 選んだら `userApi.updateTimezone` を呼び、成功したら表示を更新してモーダルを閉じる。失敗したら `Alert` で知らせて値を戻す
- **アカウント**: 「ログアウト」は github-auth step4 のログアウト処理を呼ぶ（ログイン画面へ戻る。通知の予約の取り消しは study-reminder step3 が足す）
- **危険な操作**: 「アカウントを削除」で `router.push("/settings/delete-account")`（画面は github-auth step7）

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile lint:fix
pnpm --filter mobile ios   # development build で確認する
```

挑戦 0 件のユーザーと、提出済みの挑戦があるユーザー（reading-practice の画面で提出するか、psql で `reading_attempts` に `submitted` の行を入れる）の 2 人で確認する。iOS と Android の両方で見る。

- [ ] タブが「マイページ / 問題 / 設定」の 3 つになり、メモのタブが無い
- [ ] マイページの連続日数・目標・最近の挑戦（3 件）・カレンダー・累計・種類別が API の値になっている
- [ ] 挑戦 0 件のユーザーで「最初の 1 問を解いてみましょう」が出て、統計と最近の挑戦が出ない
- [ ] 問題を提出してマイページに戻ると、今日のマスと連続日数が更新される（`useFocusEffect`）。引っ張って再取得できる
- [ ] 年表示が右端（今日）から始まり、曜日の列はスクロールしても動かない。月表示で前後の月に移動でき、1 年より前の月も表示される
- [ ] 日付を選ぶとその日の挑戦が出る。素早く切り替えても最後に選んだ日の内容になる
- [ ] 「すべて見る」で学習履歴が開き、下までスクロールすると続きが読み込まれる。「‹ マイページ」で戻れる
- [ ] 設定で目標を保存すると「目標を保存しました」が出て、マイページの目標のパネルに反映される。目標日を消して保存すると `null` になる
- [ ] タイムゾーンを選び直すと保存され、アプリを再起動しても選んだ値のまま
- [ ] 「ログアウト」でログイン画面に戻る
