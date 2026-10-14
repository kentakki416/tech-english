# step9-mobile-attempt

mobile の解答画面（`attempts/[id]/index`）を、確定済みのモック（`apps/mobile/src/app/mock/attempts/[id]/index.tsx`・`src/components/mock/PassageReader.tsx`）を移植して作る。ブロック単位の `FlatList` と入れ子の `<Text>`、段落の長押しの和訳、設問シート、`AppState` によるタイマー、`AsyncStorage` への保存を持つ。web との違いは [mobile の画面](../README.md#mobile-の画面)、実現方式は [アシストの実現方式](../README.md#アシストの実現方式技術調査の結果) と [mobile の実装構成](../README.md#mobile-の実装構成)。

## 前提

- [step4-api-attempt-submit](./step4-api-attempt-submit.md)（提出・辞書の API）、[step8-mobile-passage-list](./step8-mobile-passage-list.md)（`attempt.api.ts`・`attempt-progress.ts`・`attempt.store.ts`・root の `Stack`）
- [github-auth step4-mobile-github-login](../../github-auth/tasks/step4-mobile-github-login.md)：本文リーダー（`PassageReader` / `WordCard`）がログイン画面のデモ用に `src/components/features/passage/` へ移植済み。**この step はそれを再利用し、API のデータと `FlatList` に対応させる**。`apiClient`（401 時の refresh 付き）もここで作られている

## 対応内容

### 0. 最初に実機で確かめること

README が「実装の最初に確認する」としている 2 点を、本文リーダー（下の 2）だけを作った段階で確かめてから画面を作る。

| 確認 | 方法 | 合格の基準 |
| --- | --- | --- |
| 長押しとタップの排他 | 実機（iOS・Android）で、単語の上・単語の間で長押し / タップ | 長押しが成立したら単語のカードが出ない。単語の上の長押しも段落の和訳になる |
| 描画性能 | 600 語・コードブロック入りの本文を、Android の中級機（例：Pixel 6a / Galaxy A54 程度）の **release ビルド**（`npx expo run:android --variant release`）で表示し、Perf Monitor を出してスクロール・和訳の切り替え・長押しを繰り返す | UI / JS とも 55fps 以上を保つ。下回ったら `FlatList` の調整値・`memo` の効き方を見直す |

### 1. API 呼び出し

- `attemptApi` に `getDetail(id)`（`getAttemptResponseSchema.parse`）と `submit(id, input)`（`submitAttemptResponseSchema.parse`）を足す
- `src/features/dictionary/dictionary.api.ts`：`lookup(word)` → `GET /api/dictionary?word=`。404 は null を返す
- `src/features/dictionary/use-dictionary-lookup.ts`：結果（null も含む）を `useRef<Map>` に画面を開いている間だけ持つ hook（[英和辞書](../README.md#英和辞書) のキャッシュ。通信の失敗はキャッシュしない）。step10 でも使う

### 2. 本文リーダー（`src/components/features/passage/PassageReader.tsx`）

移植済みのリーダーを次のように作り変える（見た目はモックのまま）。ログイン画面のデモにはデモ用のデータを API の型で静的に持たせて渡す。

```tsx
type PassageReaderProps = {
  blocks: AttemptBlock[]
  fontSize?: number
  glossary: AttemptGlossaryEntry[]
  /** 結果画面の根拠。セグメントの添字の範囲 */
  highlight?: { blockIndex: number; segmentEnd: number; segmentStart: number } | null
  ListFooterComponent?: React.ReactElement
  ListHeaderComponent?: React.ReactElement
  peekBlock?: number | null
  /** React 19 なので forwardRef を使わず props で受ける */
  ref?: React.Ref<FlatList<AttemptBlock>>
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  onLookupDictionary: (word: string) => Promise<{ headword: string; meaningJa: string } | null>
  onLookupWord?: (lookup: WordLookupRecord) => void
  onPeekEnd?: () => void
  onPeekStart?: (blockIndex: number) => void
  onToggleTranslation?: (blockIndex: number) => void
  onWordCard: (content: WordCardContent) => void
}

export function PassageReader({ blocks, ref, ... }: PassageReaderProps) { ... }
```

- **ブロックごとに `FlatList` の 1 行**にする（モックは全ブロックを `View` に並べている）。画面外のブロックは描画しない
  - `initialNumToRender={6}`・`maxToRenderPerBatch={4}`・`windowSize={7}`、Android は `removeClippedSubviews`。高さが不定なので `getItemLayout` は使わない
  - 本文の上下に置くもの（出典の注記・ヒント、結果画面の上の区画）は `ListHeaderComponent` / `ListFooterComponent` で渡す。`ref` は step10 の `scrollToIndex` に使う
- 行は `BlockRow = memo(...)`、セグメントは `SegmentText = memo(...)`。**行には行ごとの値（`isTranslated` / `isPeeking` / そのブロックの `highlight` / `fontSize`）だけを渡し**、`Set` や全体の状態を渡さない（1 段落の切り替えで全行が描き直されないように）。コールバックは親で `useCallback` して参照を変えない
- セグメントは API の `blocks[].segments` をそのまま描画する（モックの `segmentText` / `lookUpDictionary` は使わない）。段落番号は `paragraph_number`
- 単語は入れ子の `<Text onLongPress onPress onPressOut>`。`code` のセグメント・ブロックは押しても何も出ない
- **長押し**：ブロックの本文を `Pressable`（`delayLongPress={300}`）で包み、`onLongPress` で `onPeekStart(blockIndex)`、`onPressOut` で `onPeekEnd()`。単語の `onLongPress` / `onPressOut` も同じ関数を呼ぶ（単語の上の長押しも段落の和訳にする）。RN の Responder は長押しが成立すると `onPress` を呼ばないので、カードは出ない
- **長押し中の和訳は英文の要素を残したまま上に重ねる**（`position: "absolute"`、`pointerEvents="none"`。英文を差し替えると押している要素が消えて `onPressOut` が来なくなるため。モックの `peek` のスタイル）
- 単語を押したら：`glossary_entry_id` があれば用語集から「この文での意味」、無ければ `await onLookupDictionary(text)`。見つかったときだけ `onLookupWord` を呼ぶ（中身は web の step6 と同じ）
- 和訳のインラインコードは、バッククォートで分けて等幅にする（表示だけの処理）。根拠のハイライトは `[segmentStart, segmentEnd)` のセグメントに淡い琥珀の背景
- `WordLookupRecord` は step8 の `attempt-progress.ts` に `AttemptProgress["wordLookups"][number]` として export する

### 3. 解答画面（`src/app/attempts/[id]/index.tsx`）

モックの `MockAttemptScreen` を部品に分けて移植する（`src/components/features/attempt/` に `SolvingTopBar` / `QuestionSheet` / `PauseOverlay` / `SubmitConfirmModal` / `ExpiredNotice`）。

**読み込み**：`useAttemptStore` に挑戦があればそれで描画し、無ければ `attemptApi.getDetail(id)`。`submitted` なら `router.replace(\`/attempts/${id}/result\`)`、`expired` なら `ExpiredNotice`（「この挑戦は期限切れです」と「問題一覧へ」）を出し、`removeAttemptProgress(id)` で端末の途中経過を消す（もう提出できないので）。

**状態**：web の step6 と同じ（`answers`・`currentIndex`・`elapsedSeconds`・`isPaused`・`isSheetOpen`・`isConfirmOpen`・`showAllTranslations`・`translatedBlocks`・`viewedTranslationBlocks`・`peekBlock`・`wordCard`・`wordLookups`・`isHydrated`・`isExpired`）。

**タイマー**

```ts
/** アプリが前面（AppState.currentState === "active"）かつ isRunning の間だけ 1 秒ごとに加算する */
export function useActiveSeconds({ initialSeconds, isRunning }: { initialSeconds: number; isRunning: boolean }): number
```

- `src/features/attempt/use-active-seconds.ts`。`isRunning = isHydrated && !isPaused && !isExpired && !isSubmitting`
- 表示はモックの上部バー（残り / 超過、20% 以下で琥珀、超過で `wrong` の全幅の進捗線）。0 になっても止めない
- 期限（24 時間）は web の step6 と同じく `server_now` で補正して 1 分ごとに確かめ、過ぎたら `ExpiredNotice`。期限切れになったら（期限の確認・提出の 409 のどちらでも）`removeAttemptProgress(attempt.id)` で途中経過を消し、それ以降は書かない（保存に使う ref を null にして、画面を離れるときにも書き戻さない）

**端末への保存**（step8 の `attempt-progress.ts`）

- マウント時に `await readAttemptProgress(id)` で戻してから `isHydrated = true`
- 回答・和訳を見た段落・調べた単語が変わったとき、経過秒数が 5 秒進むごと、`AppState` が `background` / `inactive` になったとき、画面を離れるとき（unmount）に `writeAttemptProgress` する
- 別の端末で始めた挑戦は 0 から（壁時計の上限はサーバーで効く）

**アシスト**

- 「訳」は常に薄く表示（ホバーが無いため）。押すと `translatedBlocks` を切り替え、`viewedTranslationBlocks` に足す。全文訳は上部バーのボタン
- 長押し：`onPeekStart` で `peekBlock` を立て、`Platform.OS !== "web"` なら `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`。長押しで見た段落も `viewedTranslationBlocks` に足す。`onPeekEnd` で `peekBlock = null`
- 単語のカード：画面の下端（設問シートの上）に全幅で出す（モックの `wordCardWrapper`）。`×` で閉じる
- 本文の下（`ListFooterComponent`）に出典の 1 行（web の step6 と同じ内容。リンクは `Linking.openURL`）と「段落を長押しすると、押している間だけ和訳を表示します。」

**設問シート**（`QuestionSheet`）

- 閉じた状態は高さ 60px（「設問　回答 2 / 4　Q3 を開く」）、開くと画面の高さの 78%（「本文に戻る」）。バーを押すと開閉する
- 高さは `react-native-reanimated`（導入済み）の `useSharedValue` + `withTiming(..., { duration: 300 })` で変える。**`@gorhom/bottom-sheet` は入れない**（README は「等。実装時に選定」。仕様はバーを押して開閉するだけでドラッグは要らず、依存を増やさずに済むため）
- 中身はモックのとおり：設問の番号（回答済みは琥珀の点）、設問文、選択肢 A〜D、前の設問 / 次の設問、最下部に「提出する」

**一時停止**：上部バーのボタン。`PauseOverlay` が本文と設問を覆い隠す全面の表示（モックの `pauseOverlay`）。

**提出**

- `SubmitConfirmModal`：RN の `Modal`（`transparent`）の上のダイアログ。「提出する」を上、「戻って回答する」（全問回答済みなら「戻る」）を下に縦に並べる。未回答があれば「未回答の設問が n 問あります」。`errorMessage` があればダイアログの中に `wrong` の色で出す（web の `SubmitConfirmDialog` と同じ）
- 提出の入力は web の step6 と同じ組み立て（全設問の回答、`active_seconds`、`translated_block_count`、`word_lookups`）

```ts
const submit = async () => {
  setIsSubmitting(true)
  setSubmitError(null)
  try {
    const result = await attemptApi.submit(attempt.id, buildSubmitInput())
    setStoreAttempt(result)
    router.replace(`/attempts/${attempt.id}/result`)
  } catch (error) {
    setIsSubmitting(false)
    if (isAxiosError(error) && error.response?.status === 409) {
      setIsConfirmOpen(false)
      setIsExpired(true)
      return
    }
    /** 確認のダイアログは閉じずに中へ理由を出す。閉じると同時に Alert を出すと、iOS では Modal を閉じている途中の Alert が出ないことがある */
    setSubmitError("提出できませんでした。時間をおいて再度お試しください。")
  }
}
```

- 途中経過は結果画面（step10）が消す（提出に失敗しても回答が残るように。提出 API は冪等なので再送してよい）。期限切れになったときは解答画面が消す（上の「タイマー」）

**中断**：上部バーの「‹ 中断」で `router.dismissTo("/passages")`（スタックにあるタブまで戻して問題タブを開く）。Android の戻るボタンも同じ扱い（途中経過は unmount で保存済み）。

## 動作確認

```bash
pnpm --filter mobile lint:fix
pnpm --filter mobile start
```

iOS（実機かシミュレーター）と Android（中級機の実機）で確認する。

- [ ] 0 の 2 点（長押しとタップの排他、release ビルドで 55fps 以上）を満たす
- [ ] 見た目がモックの各状態（通常・長押しの和訳・設問を開く・残り 20% 未満・時間超過・一時停止・提出確認）と同じ
- [ ] タイマーが 1 秒ごとに減る。ホームに戻って 10 秒後にアプリに戻ると、その間は減っていない。画面をロックしても止まる。一時停止で止まり、本文と設問が隠れる
- [ ] 0 を過ぎると「超過 +0:01」になり、解答を続けられる
- [ ] 段落を長押しすると振動し、押している間だけ英文の上に和訳が重なり、指を離すと英文に戻る。単語の上で長押ししても同じで、カードは出ない
- [ ] 単語のタップで用語集の意味 / 辞書の意味 / 「辞書に見つかりませんでした。」。同じ単語の 2 回目は通信しない。語義設問の対象語句は辞書の意味。インラインコードは何も出ない
- [ ] 設問シートが 300ms で開閉し、選んだ回答に琥珀の印が付く
- [ ] 回答を選んでアプリを終了（タスクキル）し、開き直して同じ問題を再開すると、回答と経過秒数（5 秒以内のずれ）が戻る
- [ ] 提出すると結果画面（step10）に置き換わる。DB の `elapsed_seconds`・`translated_block_count`・`attempt_word_lookups` が操作どおり
- [ ] 機内モードで提出すると、確認のダイアログが閉じずに中に「提出できませんでした。…」が出る（iOS でも出る）。回答は残り、機内モードを解除してそのまま再送できる
- [ ] `started_at` を 24 時間前にした挑戦を開くと期限切れの表示になり、AsyncStorage の `attempt-progress:{id}` が消える
- [ ] 600 語の本文で、スクロール中に和訳の切り替え・長押しをしてもカクつかない（Perf Monitor）
