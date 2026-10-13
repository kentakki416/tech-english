# step8-mobile-passage-list

mobile の問題一覧（問題タブ `(tabs)/passages`）と開始確認（`passages/[id]`、モーダル）を、確定済みのモックを移植して作る。見た目の正本はモック（`apps/mobile/src/app/mock/(tabs)/passages.tsx`・`mock/passages/[id].tsx`・`src/components/mock/**`）、web との違いは [mobile の画面](../README.md#mobile-の画面)。

## 前提

- [step2-api-passage-list](./step2-api-passage-list.md)、[step3-api-attempt-start](./step3-api-attempt-start.md)
- [github-auth step4-mobile-github-login](../../github-auth/tasks/step4-mobile-github-login.md)：ログイン済みで画面を開ける。Bearer を付けて 401 なら refresh して再試行する axios クライアント（`src/libs/api-client.ts` の `apiClient`）、テーマ（`src/const/design-theme.ts` の `THEME_COLORS` / `THEME_FONTS`）、root layout でのフォント（Literata / IBM Plex Mono）の読み込み、本文リーダー（`src/components/features/passage/`）
- タブのレイアウト（マイページ / 問題 / 設定。マイページと設定は learning-record step5 まで既存の画面か仮の画面）、共通部品（`src/components/ui/` の `PrimaryButton` / `SecondaryButton` / `Segment` / `Chip` / `ScoreSquares`）、`src/libs/format.ts`、`src/components/features/passage/labels.ts`、モックの `components/mock/parts.tsx` の `SourceMeta` / `DifficultyMeter`（`src/components/features/passage/`）は **この step で** 本番に移す（後の learning-record step5 が使う。[実装の順番](../../product-overview/README.md#実装の順番)）

## 対応内容

### 1. API 呼び出し

既存の `features/memo/memo.api.ts` と同じく `features/{feature}/{feature}.api.ts` に置き、レスポンスは `@repo/api-schema` のスキーマで `parse` する（`memo.entity.ts` のようなローカルの型は作らない）。

```ts
/** apps/mobile/src/features/passage/passage.api.ts */
export const passageApi = {
  /** 開始確認の概要 */
  async getDetail(id: number): Promise<GetPassageResponse> {
    const result = await apiClient.get(`/api/passage/${id}`)
    return getPassageResponseSchema.parse(result.data)
  },
  /** 問題一覧（cursor ページング） */
  async getList(query: PassageListQuery): Promise<GetPassageListResponse> {
    const result = await apiClient.get(`/api/passage?${buildPassageSearchParams(query)}`)
    return getPassageListResponseSchema.parse(result.data)
  },
  /** ランダムに 1 問。条件に合う問題が無ければ null */
  async getRandom(query: PassageFilterQuery): Promise<number | null> { ... },
}

/** apps/mobile/src/features/attempt/attempt.api.ts（step9 で getDetail / submit を足す） */
export const attemptApi = {
  async start(passageId: number): Promise<StartAttemptResponse> {
    const result = await apiClient.post(`/api/passage/${passageId}/attempt`, {})
    return startAttemptResponseSchema.parse(result.data)
  },
}
```

- `src/features/passage/passage-query.ts`：`PassageFilterQuery`（`difficulty: number[]`、`kind`、`tag: string[]`、`unattemptedOnly`）と `buildPassageSearchParams(query)`（API のクエリ名 `kind` / `tag`〈カンマ区切り〉/ `difficulty` / `unattempted_only` / `cursor`。空の条件は付けない）
- `getRandom` は axios のエラーの `response?.status === 404` なら null を返す

### 2. 途中経過の保存と挑戦のキャッシュ

```ts
/** apps/mobile/src/features/attempt/attempt-progress.ts（step9 が書き、この step と step10 が読む・消す） */
export const ATTEMPT_PROGRESS_KEY_PREFIX = "attempt-progress:"

export type AttemptProgress = {
  answers: Record<number, number>
  elapsedSeconds: number
  translatedBlockIndexes: number[]
  version: 1
  /** 提出の word_lookups にそのまま使う */
  wordLookups: { glossaryEntryId: number | null; lemma: string; source: "dictionary" | "glossary"; surface: string }[]
}

export const readAttemptProgress = async (attemptId: number): Promise<AttemptProgress | null> => { ... }
export const writeAttemptProgress = async (attemptId: number, progress: AttemptProgress): Promise<void> => { ... }
export const removeAttemptProgress = async (attemptId: number): Promise<void> => { ... }
```

- `@react-native-async-storage/async-storage`（導入済み）を `try / catch` で包む。`version` が違う・JSON が壊れていれば null
- アカウント削除（[github-auth step7](../../github-auth/tasks/step7-mobile-delete-user.md)）は `ATTEMPT_PROGRESS_KEY_PREFIX` で始まるキーをすべて消す
- `src/features/attempt/attempt.store.ts`（zustand。既存の `memo.store.ts` と同じ書き方）：`attemptsById: Record<number, GetAttemptResponse>` と `setStoreAttempt(attempt)`。開始・提出のレスポンスを入れ、解答・結果の画面が開いた直後に通信を待たずに描画できるようにする（mobile の回線の待ち時間を減らすため）

### 3. タブとルート

- タブのレイアウトをモックの `mock/(tabs)/_layout.tsx` から `(tabs)/_layout.tsx` に移す（`index` = マイページ・`passages` = 問題・`settings` = 設定）。マイページと設定の中身は learning-record step5 が作るので、それまでは既存の画面（`index`）と仮の画面（`settings`）を置く
- root の `_layout.tsx` の `Stack` に足す：`passages/[id]`・`passages/random`（どちらも `presentation: "modal"`）、`attempts/[id]/index`・`attempts/[id]/result`（どちらも `headerShown: false`）

### 4. 問題一覧（`src/app/(tabs)/passages.tsx`）

モックの `MockPassagesScreen` を移植し、`MOCK_PASSAGE_LIST` を API に置き換える。

- 絞り込みの状態（種別・難易度・タグ・未挑戦のみ）は画面の state。変わったら 1 ページ目から取り直す。技術タグのチップはレスポンスの `tags`
- 取得は hook `usePassageList(filter)`（`src/features/passage/use-passage-list.ts`）にまとめる：`{ hasError, isLoading, isLoadingMore, isRefreshing, items, loadMore, refresh, tags, totalCount }`。前の絞り込みのレスポンスが後から届いても捨てる（リクエストごとに連番を持つ）
- `FlatList`：`onEndReached`（`onEndReachedThreshold={0.5}`）で `next_cursor` があれば次のページ、`refreshing` / `onRefresh` で引っ張って更新。件数は `total_count`
- 解いて戻ったときに挑戦状況を更新するため、`useFocusEffect` で `refresh` する（初回の取得とは重ねない）
- 行：タイトル（Literata 18px、2 行まで）→ 種別とソース → 難易度・英単語数・制限時間・挑戦状況（「挑戦中」/「未挑戦」/ スコアのマスと `3/4`。判定は web の step5 と同じ）。押すと `router.push(\`/passages/${id}\`)`
- 0 件はモックの空の状態（「絞り込みを解除する」で条件を戻す）。取得に失敗したら同じ囲みで「問題を読み込めませんでした。」と「再読み込み」
- 「ランダムに 1 問」：`passageApi.getRandom(filter)` → `router.push(\`/passages/${id}\`)`。null なら押せない状態にする（`totalCount === 0` のときも押せない）

### 5. ランダムに 1 問（`src/app/passages/random.tsx`）

マイページの「ランダムに 1 問解く」（learning-record step5）とリマインダーの通知（`techenglish://passages/random`、study-reminder step3）の入口。web の `/passages/random`（step5）と同じ役割。

- マウントしたら `passageApi.getRandom({})`（絞り込みなし）を呼び、`router.replace({ params: { id: String(id) }, pathname: "/passages/[id]" })` で開始確認に置き換える
- 取得中は `canvas` の背景に琥珀の `ActivityIndicator` だけを出す。null（公開中の問題が無い）や失敗なら `router.replace("/passages")`（問題タブ）
- 静的なルート `passages/random` は動的な `passages/[id]` より優先して照合される（expo-router の仕様。実装時に確認）

### 6. 開始確認（`src/app/passages/[id].tsx`）

モックの `MockPassageStartScreen` を移植する（下から出るモーダル、右上に「閉じる」、主要ボタンは下端に固定）。

- 開いたら `passageApi.getDetail(id)`。読み込み中は `ActivityIndicator`、404 は「この問題は表示できません。」と「閉じる」
- 2 × 2 の表（難易度・英単語数・制限時間・設問）、説明（「・タイマーは「開始する」で動きます」「・アプリを閉じている間は止まります」）、出典の 1 行（`出典：{source_name}（{license_spdx}）。一部を抜粋・改変しています。`）
- `in_progress_attempt` があれば説明の代わりに再開の囲み（琥珀の枠と淡い琥珀の背景）とボタン「再開する」。中身は web の step5 の `ResumeNotice` と同じ計算で、途中経過は `await readAttemptProgress(id)`、期限は `server_now` で補正した現在時刻から求める

```ts
const startAttempt = async () => {
  setIsStarting(true)
  try {
    const attempt = await attemptApi.start(passageId)
    setStoreAttempt(attempt)
    router.replace(`/attempts/${attempt.id}`)
  } catch {
    Alert.alert("開始できませんでした", "時間をおいて再度お試しください。")
  } finally {
    setIsStarting(false)
  }
}
```

- 押した反応は `Pressable` の押下中に `amber-bright`（[mobile のデザイン](../../product-overview/README.md#mobile-のデザイン)）。開始中はボタンを無効にする

## 動作確認

```bash
pnpm --filter mobile lint:fix
pnpm --filter mobile start
```

iOS シミュレーターと Android エミュレーターの両方で、公開中の問題を数件入れた api に dev ログインして確認する。

- [ ] 問題タブがモックと同じ見た目（上部の「ランダムに 1 問」、種別のセグメントと「未挑戦のみ」が 1 行、難易度とタグのチップが 1 本の横スクロール）
- [ ] 絞り込みを変えると一覧と件数が変わる。素早く切り替えても最後の条件の結果が出る
- [ ] 21 件以上あるとき、下までスクロールすると次のページが足される。引っ張ると更新される
- [ ] 0 件の空の状態、api を止めたときの「再読み込み」
- [ ] 「ランダムに 1 問」で条件に合う問題の開始確認が下から出る
- [ ] `npx uri-scheme open "techenglish://passages/random" --ios`（`--android`）で開始確認が開く。公開中の問題が無ければ問題タブに戻る
- [ ] 開始確認：新規は「開始する」、挑戦中は再開の囲み（残り時間・回答数・期限）と「再開する」。「閉じる」と下へのスワイプで一覧に戻る
- [ ] 「開始する」で解答画面（step9）に置き換わる。戻るとモーダルではなく一覧に戻る
- [ ] access token の期限（15 分）が切れた後も一覧を取り直せる（401 → refresh → 再試行）
