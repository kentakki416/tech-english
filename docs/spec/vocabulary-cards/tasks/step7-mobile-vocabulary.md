# step7-mobile-vocabulary

mobile の単語帳を作る。タブに「単語帳」を足し（マイページ / 問題 / 単語帳 / 設定）、1 回分はスタックの全画面にする。カードはタップでめくり、めくった後はボタンか左右のスワイプで答える。結果画面の「調べた単語」に「単語帳で復習する」を足す。

## 前提

- [step2-api-vocabulary-session](./step2-api-vocabulary-session.md)・[step3-api-vocabulary-review](./step3-api-vocabulary-review.md)（API とスキーマ）
- web の [step5-web-vocabulary](./step5-web-vocabulary.md)（振る舞いをそろえる）
- 見た目・動き・効果音は README の [UI 設計](../README.md#ui-設計) に従う。確定したモック（`src/app/mock/(tabs)/vocabulary.tsx`・`src/app/mock/vocabulary/session.tsx`、部品は `src/components/mock/PaperCard.tsx`・`use-flip-sound.ts`）を本実装の場所に移して使う。紙の色（`paper` / `ink` など）は `src/const/mock-theme.ts` から `src/const/design-theme.ts` の `THEME_COLORS` に移す。めくる音の `assets/sounds/page-flip.wav` はモックの段階で入っている
- 背景は mobile の背景の PR の `AppBackdrop`（ルートのレイアウトに敷いてある）を透かす。単語帳の画面の一番外側は塗らない
- mobile の規約：[apps/mobile/CLAUDE.md](../../../../apps/mobile/CLAUDE.md)（型は `@repo/api-schema` から、env は `@/env` から、スタックからタブへ戻るのは `router.dismissTo`）
- 仕様は README の [1 回の流れ](../README.md#1-回の流れ) と [mobile の実装構成](../README.md#mobile-の実装構成)

## 対応内容

### 1. API の通信層

`src/features/vocabulary/vocabulary.api.ts`（既存の `learning-record.api.ts` と同じ、オブジェクトのメソッドで zod の `parse` を通す形）。

```typescript
/** apps/mobile/src/features/vocabulary/vocabulary.api.ts */
export const vocabularyApi = {
  /**
   * GET /api/vocabulary/session。1 回分のカード（最大 10 枚）
   */
  getSession: async (): Promise<GetVocabularySessionResponse> => {
    const result = await apiClient.get("/api/vocabulary/session")
    return getVocabularySessionResponseSchema.parse(result.data)
  },
  /**
   * GET /api/vocabulary/summary。単語帳のトップの数
   */
  getSummary: async (): Promise<GetVocabularySummaryResponse> => {
    const result = await apiClient.get("/api/vocabulary/summary")
    return getVocabularySummaryResponseSchema.parse(result.data)
  },
  /**
   * POST /api/vocabulary/review。client_review_id で冪等なので、失敗したら同じ値で送り直してよい
   */
  review: async (input: ReviewVocabularyCardRequest): Promise<ReviewVocabularyCardResponse> => {
    const result = await apiClient.post("/api/vocabulary/review", input)
    return reviewVocabularyCardResponseSchema.parse(result.data)
  },
}
```

### 2. タブとスタック

- web 表示では react-native-screens が無効で、外したタブの画面が `zIndex: -1` で残る。画面は AppBackdrop を透かす（塗らない）ので外したタブが透けて重なる。web 表示だけタブの `animation` を `"fade"` にして、外したタブの不透明度を 0 にする（iOS / Android は外したタブを描かないので `"none"` のまま）
- `src/app/(tabs)/_layout.tsx` に「問題」と「設定」の間で `<Tabs.Screen name="vocabulary" options={{ tabBarIcon: …"albums-outline"…, title: "単語帳" }} />` を足す。コメントの「タブ（マイページ / 問題 / 設定）」も直す
- `src/app/_layout.tsx` の `Stack.Protected guard={status === "signedIn"}` に、JSDoc のコメントつきで `<Stack.Screen name="vocabulary/session" options={{ headerShown: false }} />` を足す（上部バーは画面が持つ）

### 3. 単語帳のトップ（タブ）

`src/app/(tabs)/vocabulary.tsx`。マイページのタブと同じく `useFocusEffect` で開くたびに summary を取り直し（1 回分から戻ったときに数が変わるため）、`requestSeqRef` で古い応答を捨てる。

- 上部はタブの画面と同じ「画面名だけ」の上部
- 状態ごとに出すものは web の step5 の `VocabularySummaryPanel` と同じ（今日の分がある / 今日の分が無い / 候補もカードも無い）。「はじめる」は `router.navigate("/vocabulary/session")`（素早く 2 回押しても 1 回分の画面を 2 枚積まない）、問題一覧への導線は `router.navigate("/passages")`（タブからタブへ）
- 読み込み中・失敗は `history.tsx` と同じ（`ActivityIndicator`・「読み込めませんでした。」と「再読み込み」）

### 4. 1 回分の画面（スタック）

`src/app/vocabulary/session.tsx` が `vocabularyApi.getSession()` で 1 回分を取り、`src/components/features/vocabulary/VocabularySession.tsx` に渡す。「もう 1 回」は取り直して `VocabularySession` の `key` を変え、前の回の state を持ち越さない。

`VocabularySession` の state と保存の流れは web と同じ（答えたら保存を待たずに次へ進み、答えごとに `clientReviewId` と `saveStatus` を持つ。失敗はふりかえりで同じ `clientReviewId` で送り直す）。

```typescript
/**
 * 1 枚の答え。clientReviewId は送り直しでも同じ値を使う（API が冪等）
 */
type CardAnswer = {
  activeSeconds: number
  clientReviewId: string
  grade: ReviewVocabularyCardRequest["grade"]
  lemma: string
  saveStatus: "failed" | "saved" | "saving"
}

const answer = (grade: CardAnswer["grade"], activeSeconds: number) => {
  if (!current || !isFlipped) return
  const next: CardAnswer = { activeSeconds, clientReviewId: Crypto.randomUUID(), grade, lemma: current.lemma, saveStatus: "saving" }
  setAnswers((previous) => [...previous, next])
  setIsFlipped(false)
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  void save(next)
}

const save = async (target: CardAnswer) => {
  let status: CardAnswer["saveStatus"] = "saved"
  try {
    await vocabularyApi.review({
      active_seconds: target.activeSeconds,
      client_review_id: target.clientReviewId,
      grade: target.grade,
      lemma: target.lemma,
    })
  } catch (error) {
    console.warn("Failed to save vocabulary review:", error)
    status = "failed"
  }
  setAnswers((previous) => previous.map((item) => (item.clientReviewId === target.clientReviewId ? { ...item, saveStatus: status } : item)))
}
```

- `Crypto` は `expo-crypto`（導入済み。`src/features/auth/github-oauth.ts` と同じ `Crypto.randomUUID()`）
- 上部バーは `history.tsx` と同じ形（`SafeAreaView edges={["top"]}`・「‹ 単語帳」で `router.back()`・中央に進み具合 `3 / 10`）。進み具合のマスが「覚えた」で灯る動き（web の `lamp-on`）は mobile では省く
- 読み上げ：2 枚目からはカードが出たときにフォーカスをカードへ移し（`AccessibilityInfo.sendAccessibilityEvent`）、カードのラベルの先頭で「10 枚中 3 枚目」と伝える。ふりかえりでは見出しへフォーカスを移す
- 途中で戻っても確認は出さない（答えた分は保存済み）

### 5. カード（めくる・スワイプ）

`src/components/features/vocabulary/FlashCard.tsx`。`key={current.lemma}` で 1 枚ごとに作り直す。

- **見ていた秒数**：解答画面の `src/features/attempt/use-active-seconds.ts` を `src/libs/use-active-seconds.ts` に移して両方から使い、`useActiveSeconds({ initialSeconds: 0, isRunning: true })`（`AppState` が `active` の間だけ数える）
- **めくる**：カード全体を `Pressable` にし、タップで `isFlipped` を切り替える。web と同じく、表と裏を重ねて 180deg 回す作りにはせず、RN の `Animated.timing`（440ms、ネイティブドライバ）で `rotateY` を 0 → 90deg → -90 → 0deg と動かし、220ms 後に表示する面を差し替える（モックの `session.tsx` の `FlipCard` と同じ）
- **束**：`CardStackBehind`（後ろに 2 枚、残りの枚数で減らす）を手前のカードの後ろに置く。答えたら 280ms で横へ飛ばし、次のカードは束から上がる（280ms）
- **効果音**：`use-flip-sound.ts`（`expo-audio` の `useAudioPlayer` で `page-flip.wav` を鳴らす。鳴らす前に `seekTo(0)`）。めくるたび（表 → 裏、裏 → 表）に鳴らす。オン / オフは上部バーの右のスピーカーで切り替え、`AsyncStorage`（キー `tech-english:vocabulary-sound`）に覚える。フックは `src/features/vocabulary/use-flip-sound.ts`。初めて鳴らすときに `setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false })`（iOS の ambient）にし、消音モードでは鳴らさず、ほかのアプリの音楽も止めない（何も設定しないと iOS の既定の soloAmbient で、鳴らすたびにほかのアプリの音楽を止める）。読み上げは画面ごとに再生を始めるときに自分のモード（消音モードでも鳴らす・ほかを止める）にし直すので、こちらで変えても読み上げは困らない
- **視差効果を減らす設定**：`useReducedMotion()`（reanimated。既存の `use-reading-auto-scroll.ts` と同じ）が `true` なら、めくる・飛ばす・上がるを省いて切り替えだけにする
- **スワイプ**：モックと同じく RN の `PanResponder` と `Animated.Value` で作る（1 回分の画面はスクロールしないので、ジェスチャーの取り合いが起きない）
  - めくる前は `onMoveShouldSetPanResponder` で引き受けない（意味を見ずに答えられないように）。横に 10px 以上、縦より大きく動いたときだけ始める
  - 指に合わせて `translateX` と最大 10deg の回転を付け、離したときに横に画面幅の 30% 以上動いていれば答える（右が「覚えた」、左が「まだ」）。足りなければ `Animated.spring` で戻す
  - `PanResponder` は 1 回だけ作るので、今の `isFlipped` と答えの関数は `useRef` で最新を参照する（モックの `latest` と同じ）
- **答えのボタン**：めくった後だけ、カードの下に「まだ」と「覚えた」を出す（スワイプが苦手な人と、読み上げを使う人のため）
- **読み上げ**：カードに `accessibilityRole="button"` と「めくる」のヒント。めくった後は意味を `accessibilityLiveRegion="polite"`（Android）／`AccessibilityInfo.announceForAccessibility`（iOS）で伝える。スワイプは読み上げの利用中は使えないので、ボタンで答えられることを保つ

本文の 1 文は `src/components/features/vocabulary/SentenceText.tsx` で、`splitInlineCode`（`src/components/features/passage/passage-text.ts`）を使い、入れ子の `<Text>` で描く。強調は `PassageReader` の根拠の強調（`rgba(243, 178, 76, 0.22)` の背景）、インラインコードは `styles.inlineCode` と同じ見た目にする。

### 6. ふりかえり

`src/components/features/vocabulary/SessionReview.tsx`。web と同じ中身（「覚えた 7 / まだ 3」・「まだ」の単語の一覧・保存できなかったカードの送り直し・「もう 1 回」・「単語帳のトップへ」は `router.back()`）。保存中のカードが残っている間は「もう 1 回」を押せない。

### 7. 結果画面からの導線

`src/components/features/attempt/ResultHeader.tsx` の `WordLookupSection` の見出しの行に、調べた単語が 1 つ以上あるときだけ「単語帳で復習する」を足す。押すと `router.dismissTo("/vocabulary")`（スタックの結果画面からタブへ戻る。[apps/mobile/CLAUDE.md](../../../../apps/mobile/CLAUDE.md)）。`ResultHeader` は今 router を持たないので `useRouter` を足す。

## 動作確認

```bash
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile exec expo export --platform ios
pnpm --filter mobile exec expo export --platform android
```

mobile にはテストランナーが無いので、手で確かめる。前もって問題を 1 つ提出し、単語を 2〜3 個調べておく。

Expo web（port 8085、Dev Login）で：

- [ ] タブに「単語帳」が「問題」と「設定」の間に出て、トップの数が API と一致する
- [ ] 「はじめる」で 1 回分が開き、タップでめくれる。めくる前は答えのボタンが無い
- [ ] 「覚えた」「まだ」で次のカードへ進み、`vocabulary_reviews` に 1 行ずつ増える
- [ ] ふりかえりの数と「まだ」の単語が合っている。「単語帳のトップへ」で戻ると数が減っている
- [ ] 「もう 1 回」で前の回の state が残らない
- [ ] 結果画面の「単語帳で復習する」で単語帳のタブへ戻る

iOS シミュレーター（または実機）で（Expo web では確かめられないもの）：

- [ ] めくる動きが滑らかで、「視差効果を減らす」を有効にすると切り替えだけになる
- [ ] めくった後、右へのスワイプで「覚えた」、左で「まだ」になり、少しだけ動かして離すと元に戻る。めくる前はスワイプしない
- [ ] カードはスクロールしない。語義の多い単語（辞書の意味）・大きな文字の設定でも、意味と出どころが紙からはみ出さない（語義は 4 つまで、紙の上の文字は 1.3 倍まで）
- [ ] 答えたときに軽く振動する
- [ ] めくるたびに「シュッ」と鳴り、上部バーで消すと鳴らない。アプリを開き直しても消した設定が残る
- [ ] 束が 3 枚に見え、本番と同じ背景（AppBackdrop）が透けている
- [ ] VoiceOver でカードをめくり、ボタンで答えられる
- [ ] 機内モードで答えると、ふりかえりに「保存できなかったカードがあります」が出て、戻してから「もう一度送る」と保存される（答えは 1 行だけ）
