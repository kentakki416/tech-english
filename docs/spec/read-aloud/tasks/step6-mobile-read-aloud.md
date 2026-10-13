# step6-mobile-read-aloud

mobile の解答画面（`attempts/[id]`）と結果画面（`attempts/[id]/result`）に読み上げを足す。構成と動きは web（[step5-web-read-aloud](./step5-web-read-aloud.md)）と同じで、再生は `expo-audio`。ここには web との違いを中心に書く。

- 仕様・見た目：[UI 設計の mobile の画面](../README.md#mobile-の画面) とその上の各節（モックは `apps/mobile/src/components/mock/ReadAloud.tsx`・`PassageReader.tsx`・`app/mock/attempts/[id]/index.tsx`・`result.tsx`）
- 実装の方針：[再生の実装](../README.md#再生の実装)

## 前提

- [step4-api-attempt-audio](./step4-api-attempt-audio.md)（`GET /api/attempt/:id/audio`・提出の `listened_block_count`）。実機で確かめるときは api の `AUDIO_PUBLIC_URL_BASE` を `http://<PC の LAN の IP>:8080/media` にする
- [step5-web-read-aloud](./step5-web-read-aloud.md)（時刻表の純関数・hook の振る舞い・操作の表。mobile も同じ振る舞いにする）
- [reading-practice step9-mobile-attempt](../../reading-practice/tasks/step9-mobile-attempt.md)（`SolvingScreen`・`PassageReader`・`attempt-progress.ts`・`QuestionSheet`）・[step10-mobile-result](../../reading-practice/tasks/step10-mobile-result.md)（`ResultScreen`・`ResultHeader`）

## 対応内容

### 1. 依存

```bash
pnpm --filter mobile add expo-audio@~1.1.1
```

- 版は Expo SDK 54 の `bundledNativeModules.json` の値。`npx expo install` は使わず、版を指定して pnpm で足す
- ネイティブのモジュールなので、iOS / Android の development build を作り直す
- `app.json` の `plugins` には足さない（config plugin はマイクの権限とバックグラウンド再生のためのもので、どちらも使わない）

### 2. 音声のマニフェストの取得（`src/features/attempt/attempt.api.ts`）

mobile は api を直接呼ぶ。

```ts
/**
 * GET /api/attempt/:id/audio。準備中・失敗は status だけ。他人の挑戦・存在しない ID は API が 404
 */
getAudio: async (id: number): Promise<GetAttemptAudioResponse> => {
  const result = await apiClient.get(`/api/attempt/${id}/audio`)
  return getAttemptAudioResponseSchema.parse(result.data)
},
```

### 3. 時刻表の純関数（`src/features/read-aloud/read-aloud-timeline.ts`）

web の `src/features/read-aloud/read-aloud-timeline.ts`（[step5 §2](./step5-web-read-aloud.md#2-時刻表の純関数srcfeaturesread-aloudread-aloud-timelinets)）と同じ内容にする。web と mobile で共有するクライアントのパッケージが無いので写す（ファイルの先頭のコメントに「web と同じ。変えるときは両方」と書く）。

### 4. 再生速度の保存（`src/features/read-aloud/read-aloud-rate.ts`）

```ts
export type ReadAloudRate = 0.75 | 1 | 1.25

export const READ_ALOUD_RATES: readonly ReadAloudRate[] = [0.75, 1, 1.25]

/**
 * AsyncStorage の `read-aloud-rate`。無い・読めない・不正な値は 1 倍
 */
export const readReadAloudRate = async (): Promise<ReadAloudRate> => { /* ... */ }

/**
 * 保存に失敗しても、開いている画面では選んだ速度で再生する
 */
export const writeReadAloudRate = async (rate: ReadAloudRate): Promise<void> => { /* ... */ }

/**
 * 押すたびに 0.75 → 1 → 1.25 → 0.75（mobile はメニューを開かない）
 */
export const findNextReadAloudRate = (rate: ReadAloudRate): ReadAloudRate => { /* ... */ }
```

アカウント削除の `AsyncStorage.clear()` で一緒に消える（個人の情報ではないので、消えても困らない）。

### 5. 再生の hook（`src/features/read-aloud/use-read-aloud.ts`）

返す値・操作は web の `useReadAloud`（[step5 §4](./step5-web-read-aloud.md#4-再生の-hooksrccomponentsfeaturesread-alouduse-read-aloudts)）と同じ（`setRate` の代わりに `cycleRate`）。違うところ：

```ts
const player = useAudioPlayer(null, { updateInterval: 100 })

useEventListener(player, "playbackStatusUpdate", (status) => {
  /** 単語の追跡・聞いた段落・パートの終わり・isPlaying の同期 */
})
```

- **取得**：マウント時に `attemptApi.getAudio(attemptId)`。axios の失敗は `error`。アンマウント後に届いた結果は捨てる
- **音声の設定**：初めて再生するときに 1 回だけ `setAudioModeAsync({ interruptionMode: "doNotMix", playsInSilentMode: true, shouldPlayInBackground: false })`（消音モードでも鳴らす。ほかのアプリの音楽は止める）。失敗しても再生は続ける（`console.warn`）
- **パートの開始**：`player.replace({ uri: part.url })` → `player.shouldCorrectPitch = true` → `player.setPlaybackRate(rate)` → `player.play()`。`replace` の後は速度が戻ることがあるので、毎回設定し直す
- **単語の追跡**：`playbackStatusUpdate` の `currentTime`（秒）× 1000 で `findWordIndexAt`。単語が変わったときだけ state を変える
- **パートの終わり**：`status.didJustFinish` で、web の `ended` と同じく次のパート・次のブロック・待機に進む。外から止めた（`pause()`：一時停止の操作・上部バーの一時停止・`AppState`・上に画面を積んだとき）後に届いたら、web と同じく次のパートがあれば `replace` だけして `play()` せず一時停止の表示にする（再開すると次のパートの最初から鳴る）。次が無ければ `stop()`。「止めた」印は `togglePlay` の再開と自分の操作で始めたとき（`start`）に下ろす。expo-audio のネイティブは、電話・Siri などの割り込みの終わり（iOS の `shouldResume`、Android の音声フォーカスの回復）やアプリが前面に戻ったときに、止める前に鳴っていた player を `play` し直すので、`togglePlay` を通らずに再生が戻ったら（止めてから・パートを `replace` してから 2 秒以上たって、止めた位置〈`replace` の後は 0〉より 200ms 以上進んだ `playing: true` の更新が来たら）印を下ろす（下ろさないと段落の境目で止まる。止めた直後に届く古い `playing: true` の更新とは時刻と位置で見分ける）
- **パートの終わりの確かめ**：`didJustFinish` は、上の長さの判定（±250ms）に加えて、`player.currentTime` が今のパートの終わり（`player.duration` とマニフェストの `durationMs` の短いほう）から 250ms 以内のときだけ受ける。iOS の expo-audio は終わりの更新の `currentTime` を player の長さに書き換えて送るので、位置は `status` ではなく `player` から読む（他の player の終わりの通知を受けても、一時停止中のパートを次のパートに差し替えないため）
- **画面を離れている間**：上に画面を積んでいる間（`useIsFocused()` が false）の `playbackStatusUpdate` は捨てる（その間は一時停止している）。捨てたためにパートの終わりを受けそこねたまま戻ってきたら、`togglePlay` の再開で `player.currentTime` が終わりにあれば次のパートから鳴らす（そのまま `play()` すると終わった位置から動かず、再生中の表示のまま止まる）
- **前のパートの更新を捨てる**：ネイティブからの `playbackStatusUpdate` は非同期に届くので、`replace` の前に送られた前のパートの更新が何件も後から届くことがある。`replace` の後は、`status.duration`（秒）が新しいパートの `durationMs` と ±250ms で合う更新が来るまで捨てる（`duration` がまだ 0・NaN の更新も捨てる）。前のパートと長さが 250ms 以内で区別できないときは、合わせて再生位置が 1 秒未満の更新だけを新しいパートのものとする（新しいパートは最初から鳴らすので、最初の更新の位置は 0 に近い。1 秒未満の短いパートどうしを切り替えた直後に限り、前のパートの終わりの更新を取り違えて次のパートへ早く進むことがある）。`replace` から 2 秒たっても合う更新が来なければ、長さを問わず新しいパートのものとする（長さの報告がマニフェストとずれる端末でも、単語の追跡とパートの終わりの処理を止めないため）
- **isPlaying**：`status.playing` に合わせる（電話・ほかのアプリの音声で OS が止めたときも表示を合わせる）
- **読み込みの失敗**：`AudioStatus` にはエラーが無いので、`replace` してから 10 秒たっても `status.isLoaded` にならなければ止めて `availability = "error"` にする。web と同じく時刻表も捨て、次の再生ボタンでマニフェストを取り直す（取り直したら待機に戻り、もう一度押すと再生する）
- **アプリが前面でなくなったとき**：`AppState` が `active` 以外になったら `pause()`
- **速度**：`cycleRate()` で `findNextReadAloudRate`、`writeReadAloudRate`、再生中なら `player.setPlaybackRate`
- アンマウントで `pause()`（player の解放は `useAudioPlayer` が行う）
- 次のパートの先読みはしない（[再生の実装](../README.md#再生の実装)）

### 6. PassageReader（`src/components/features/passage/PassageReader.tsx`）

web と同じ `readAloud` の props（`activeBlockIndex`・`isAvailable`・`playingBlockIndex`・`reading`・`onPlayBlock`）と、自動スクロールのための `onScrollBeginDrag` を足す（FlatList にそのまま渡す）。

- `renderItem` から `MemoizedBlockRow` にブロックごとの値（`isReadingBlock`・`isPlayingBlock`・`readingSegmentStart` / `readingSegmentEnd`・`isReadAloudAvailable`・`onPlayBlock`）を渡す。`renderItem` の依存に足すと FlatList は見えている行を描き直すが、memo で値の変わった行（読み上げ中の行）だけが描き直される
- **和訳**：`isTranslated` に `!isReadingBlock` を足す。長押しの和訳（`isPeekVisible`）は読み上げ中の段落でも出す
- **段落の再生ボタン**：「訳」の下（`block.type !== "code"` かつ `onPlayBlock` があるとき）。20px 角・`lineStrong` の枠・常に 70% の不透明度。読み上げ中の行は「訳」の和訳中と同じ配色（`translateButtonActive`）。`Ionicons` の `play` / `pause`（10px）。`disabled={!isReadAloudAvailable}` で、無効のときは不透明度 30%。`hitSlop={8}`、`accessibilityLabel` は web と同じ
- **単語のハイライト**：`MemoizedSegmentText` に `isReading`（添字が範囲内）を渡し、`{ backgroundColor: "rgba(243, 178, 76, 0.15)", textDecorationColor: THEME_COLORS.amber, textDecorationLine: "underline" }` を足す。根拠のハイライトと重なってもよい（両方のスタイルを並べる）

### 7. ミニプレーヤー（`src/components/features/read-aloud/ReadAloudBar.tsx`）

モックの `ReadAloud.tsx` の `ReadAloudBar`・`ReturnToReadingButton` を本実装に移す。表示の分け方（`pending` / `failed` / `loading` / `error` / 待機 / 再生中）とラベルは web（[step5 §6](./step5-web-read-aloud.md#6-ミニプレーヤーsrccomponentsfeaturesread-aloudreadaloudbartsx)）と同じ。違いは：

- 速度は枠つきの箱（幅 46px 以上、`font-code` 12px の `1x`）で、押すと `onRateCycle`。`accessibilityLabel` は「再生速度 1 倍。押すと切り替え」
- 高さ 52px・角丸 14px・再生ボタンは直径 36px（押している間 `amberBright`）。色は `THEME_COLORS`
- `R` のキーキャップは無い

### 8. 自動スクロール（`src/features/read-aloud/use-reading-auto-scroll.ts`）

```ts
export function useReadingAutoScroll(
  listRef: React.RefObject<FlatList<AttemptBlock> | null>,
  activeBlockIndex: number | null,
): {
  isFollowing: boolean
  /**
   * PassageReader の onScrollBeginDrag に渡す
   */
  onScrollBeginDrag: () => void
  resumeFollowing: () => void
}
```

- 追っている間に `activeBlockIndex` が変わったら `listRef.current?.scrollToIndex({ animated: !isReducedMotion, index, viewOffset: BLOCK_SCROLL_VIEW_OFFSET })`。まだ描画していない遠いブロックは PassageReader の `onScrollToIndexFailed` がやり直す（結果画面の「本文の根拠を見る」と同じ）
- `isReducedMotion` は `react-native-reanimated` の `useReducedMotion()`
- 読み上げ中に指で本文を動かし始めたら（`onScrollBeginDrag`）追うのを止める。`scrollToIndex` は drag を起こさないので止まらない
- `resumeFollowing`・読み上げが終わったら追う状態に戻すのは web と同じ

### 9. 途中経過（`src/features/attempt/attempt-progress.ts`）

web と同じく `listenedBlockIndexes?: number[]` を足し、版は上げない（[step5 §8](./step5-web-read-aloud.md#8-途中経過srcfeaturesattemptattempt-progressts)）。

### 10. 解答画面（`src/components/features/attempt/SolvingScreen.tsx`）

web の解答画面（[step5 §9](./step5-web-read-aloud.md#9-解答画面srccomponentsfeaturesattemptsolvingscreentsx)）と同じ扱い（聞いた段落の復元・保存・提出、一時停止・期限切れ・提出で止める、待機中に始めるときと段落の再生ボタンで `resumeFollowing`）。違うところ：

- `PassageReader` に `ref`（`readerRef`）を渡し、`useReadingAutoScroll(readerRef, readAloud.playback?.blockIndex ?? null)` に使う
- ミニプレーヤーは本文の上に浮かべる：`position: "absolute"`・左右 12px・`bottom: closedSheetHeight + 12`・`zIndex: 30`（単語のカードの 35 より下）。`pointerEvents="box-none"` の入れ物の中に、追うのを止めていて読み上げ中なら `ReturnToReadingButton`、その下に `ReadAloudBar`
- **設問シートを開いている間はミニプレーヤーを出さない**
- 単語のカードの `bottom` を `closedSheetHeight + 12 + 52 + 12`（ミニプレーヤーの上）にする
- 本文の下の余白（`contentContainerStyle` の `paddingBottom`）に、ミニプレーヤーの高さと間（76px）を足す（最後の段落と出典が隠れないように）
- `PauseOverlay` はミニプレーヤーより上に重ねる（一時停止中は押せないように。`PauseOverlay` の `zIndex` を確かめ、足りなければ上げる）

### 11. 結果画面（`src/components/features/attempt/ResultScreen.tsx`・`ResultHeader.tsx`）

- `useReadAloud({ attemptId: result.id, blocks })`（`onBlockListened` は渡さない）、`useReadingAutoScroll(readerRef, ...)`（`readerRef` は今の「本文の根拠を見る」のもの）
- ミニプレーヤーは `body` の中で `bottom: 12`（`body` は下端の `ResultBottomBar` の上で終わるので、その上に浮かぶ）。単語のカードの `bottom` を `12 + 52 + 12` に、本文の下の余白に 76px を足す
- `ResultHeader` のアシストの使用に `<Text style={styles.metricSmall}>読み上げ {result.listened_block_count} 段落</Text>`（単語の回数の後ろ）

### 12. CLAUDE.md

`apps/mobile/CLAUDE.md` の「web 表示で確かめられないこと」に足す：読み上げの消音モードでの再生・ほかのアプリの音声との切り替え（`setAudioModeAsync` は web では効かない）、アプリを閉じたときの一時停止（`AppState`）。

## 動作確認

```bash
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile exec expo export --platform ios
pnpm --filter mobile exec expo export --platform android
```

Expo web（port 8085、`apps/mobile/CLAUDE.md` の手順で Dev Login）で、web の [step5 の動作確認](./step5-web-read-aloud.md#動作確認) と同じ項目を確かめる（`R` キー・速度のメニュー・`visibilitychange` を除く）。音声は `TTS_PROVIDER=fake pnpm --filter cron generate:audio` で作る。`expo-audio` は web では HTML の audio で動く。

- [ ] 開いた直後にマニフェストを 1 回取得し、「全文を読み上げ」になる
- [ ] 全文・段落の再生、全文の途中での段落の切り替え、一時停止・再開・停止がミニプレーヤーと段落の再生ボタンで web と同じく動く
- [ ] 速度の箱を押すたびに 0.75x → 1x → 1.25x → 0.75x と変わり、ハイライトの進みが変わる。画面を開き直しても残る
- [ ] 段落が変わるたびに、その段落の始まりが「本文の根拠を見る」と同じ位置に来る。まだ描画していない後ろの段落にも移る
- [ ] 読み上げ中に本文をドラッグすると「読み上げ中の位置に戻る」が出て、押すと戻る
- [ ] 和訳中・全文訳の段落は読んでいる間だけ英文。読み上げ中の段落を長押しすると和訳が重なる
- [ ] 設問シートを開くとミニプレーヤーが消え、閉じると戻る。単語のカードがミニプレーヤーの上に出る。最後の段落と出典がミニプレーヤーに隠れずに読める
- [ ] 上部バーの一時停止で読み上げも止まり、再開しても止まったまま
- [ ] 聞いた段落が提出後の結果画面の「読み上げ n 段落」と `reading_attempts.listened_block_count` に出る。アプリを開き直して再開しても数が残る
- [ ] 準備中・失敗・api の停止（取り直し）の表示が web と同じ
- [ ] 結果画面：ミニプレーヤーが下端の操作の上に浮かび、読み上げが動く。聞いても `listened_block_count` は変わらない
- [ ] コンソールにエラーが無い

**実機（iOS / Android の development build）でだけ確かめられること**（PR に未確認として書く）

- [ ] 本物の音声（Polly、または `TTS_PROVIDER=fake` の無音）がハイライトと合って進む。1.25x でも声の高さが変わらない
- [ ] 消音モード（iOS のサイレントスイッチ）でも音が出る。ほかのアプリの音楽が止まる
- [ ] ホームに戻る・画面をロックすると止まり、戻っても止まったまま
- [ ] 電話・ほかのアプリの音声で止まったとき、ミニプレーヤーが一時停止の表示になる
- [ ] 電話・Siri の割り込みの後や、ホームから戻ったときに OS（expo-audio のネイティブ）が再生を戻した場合、段落の境目で止まらずに次の段落へ進む（戻したときに再生しないのが本来の動きなので、戻ること自体が起きるかも記録する）
- [ ] 結果画面で読み上げ → 一時停止せずに「もう一度解く」（push で一時停止）→ 上の解答画面で読み上げて段落をまたいでも、戻った結果画面の読み上げは同じ段落のまま一時停止している（次の段落に進んでいない）。再開すると止めた位置から鳴る
- [ ] 段落の終わりの直前に「もう一度解く」を押して戻り、再開すると、次の段落から鳴る（再生中の表示のまま止まらない）
- [ ] 段落の間の切り替えの間（先読みしないため）が気にならない長さ
