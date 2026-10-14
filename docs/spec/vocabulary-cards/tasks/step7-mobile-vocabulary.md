# step7-mobile-vocabulary

mobile の単語帳を作る。タブに「単語帳」を足し（マイページ / 問題 / 単語帳 / 設定）、1 回分はスタックの全画面にする。カードはタップでめくり、めくった後はボタンか左右のスワイプで答える。結果画面の「調べた単語」に「単語帳で復習する」を足す。

## 前提

- [step2-api-vocabulary-session](./step2-api-vocabulary-session.md)・[step3-api-vocabulary-review](./step3-api-vocabulary-review.md)（API とスキーマ）
- web の [step5-web-vocabulary](./step5-web-vocabulary.md)（振る舞いをそろえる）
- **`design-mock` skill で mobile のモック（`apps/mobile/src/app/mock/vocabulary*`）を作り、README の「UI 設計」に mobile の画面を足してから始める**
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

- `src/app/(tabs)/_layout.tsx` に「問題」と「設定」の間で `<Tabs.Screen name="vocabulary" options={{ tabBarIcon: …"albums-outline"…, title: "単語帳" }} />` を足す。コメントの「タブ（マイページ / 問題 / 設定）」も直す
- `src/app/_layout.tsx` の `Stack.Protected guard={status === "signedIn"}` に、JSDoc のコメントつきで `<Stack.Screen name="vocabulary/session" options={{ headerShown: false }} />` を足す（上部バーは画面が持つ）

### 3. 単語帳のトップ（タブ）

`src/app/(tabs)/vocabulary.tsx`。マイページのタブと同じく `useFocusEffect` で開くたびに summary を取り直し（1 回分から戻ったときに数が変わるため）、`requestSeqRef` で古い応答を捨てる。

- 上部はタブの画面と同じ「画面名だけ」の上部
- 状態ごとに出すものは web の step5 の `VocabularySummaryPanel` と同じ（今日の分がある / 今日の分が無い / 候補もカードも無い）。「はじめる」は `router.push("/vocabulary/session")`、問題一覧への導線は `router.push("/passages")`（同じタブの階層なので push でよい）
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
- 上部バーは `history.tsx` と同じ形（`SafeAreaView edges={["top"]}`・「‹ 単語帳」で `router.back()`・中央に進み具合 `3 / 10`）
- 途中で戻っても確認は出さない（答えた分は保存済み）

### 5. カード（めくる・スワイプ）

`src/components/features/vocabulary/FlashCard.tsx`。`key={current.lemma}` で 1 枚ごとに作り直す。

- **見ていた秒数**：解答画面の `src/features/attempt/use-active-seconds.ts` を `src/libs/use-active-seconds.ts` に移して両方から使い、`useActiveSeconds({ initialSeconds: 0, isRunning: true })`（`AppState` が `active` の間だけ数える）
- **めくる**：カード全体を `Pressable` にし、タップで `isFlipped` を切り替える。`react-native-reanimated` の `useSharedValue` と `withTiming`（400ms）で `rotateY` を 0 → 180deg にし、表と裏の `Animated.View` を重ねて `backfaceVisibility: "hidden"`。既存の `QuestionSheet.tsx` と同じ書き方
- **視差効果を減らす設定**：`useReducedMotion()`（reanimated。既存の `use-reading-auto-scroll.ts` と同じ）が `true` なら `withTiming` を使わず、値を直接切り替える
- **スワイプ**：`react-native-gesture-handler` の `Gesture.Pan()` と `GestureDetector`（このアプリで初めて使う。ルートレイアウトは `GestureHandlerRootView` で包まれている）
  - めくる前は `enabled(false)`（意味を見ずに答えられないように）
  - 指に合わせて `translateX` と少しの回転を付け、離したときに横に `SWIPE_THRESHOLD`（画面幅の 30%）以上動いていれば、その方向に飛ばして答える（右が「覚えた」、左が「まだ」）。足りなければ `withSpring` で戻す
  - ジェスチャーのコールバックは UI スレッドで動くので、答えの処理（JS）は `react-native-worklets` の `scheduleOnRN` で呼ぶ（Reanimated 4 で `runOnJS` の代わり。導入済みのバージョンの書き方を実装時に確かめる）
  - 縦のスクロールを奪わないよう `activeOffsetX([-10, 10])` で横に動いたときだけ始める
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
- [ ] 縦のスクロール（長い 1 文）がスワイプと取り合わない
- [ ] 答えたときに軽く振動する
- [ ] VoiceOver でカードをめくり、ボタンで答えられる
- [ ] 機内モードで答えると、ふりかえりに「保存できなかったカードがあります」が出て、戻してから「もう一度送る」と保存される（答えは 1 行だけ）
