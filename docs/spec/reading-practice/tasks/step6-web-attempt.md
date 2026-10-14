# step6-web-attempt

web の解答画面（`/attempts/[id]`）を、確定済みのモック（`apps/web/src/app/mock/attempts/[id]/SolvingScreen.tsx`）を移植して作る。タイマー・回答・アシスト（段落の和訳・単語の意味）・キーボード操作・一時停止・端末への保存・提出を持つ。画面の仕様は [UI 設計の問題を解く](../README.md#問題を解く)、動きの仕様は [タイマー](../README.md#タイマー)・[回答と提出](../README.md#回答と提出)・[アシスト](../README.md#アシスト)・[時間の計測](../README.md#時間の計測)。

## 前提

- [step4-api-attempt-submit](./step4-api-attempt-submit.md)（提出・辞書の API）、[step5-web-passage-list](./step5-web-passage-list.md)（`attempt.api.ts`・`attempt-progress.ts`・`passage-query.ts`）
- [github-auth step3-web-github-login](../../github-auth/tasks/step3-web-github-login.md)：本文リーダー（`PassageReader` / `WordCard`）がログイン画面のデモ用に `src/components/features/passage/` へ移植済み。**この step はそれを再利用し、API のデータを受けられるように拡張する**

## 対応内容

### 1. API 呼び出しと Route Handler

- `attemptApi`（`features/attempt/attempt.api.ts`）に `getDetail(id)`（`getAttemptResponseSchema.parse`）と `submit(id, input)`（`submitAttemptResponseSchema.parse`）を足す
- `src/features/dictionary/dictionary.api.ts`（`server-only`）：`lookup(word)` → `GET /api/dictionary?word=`
- `src/app/api/dictionary/route.ts`：Client Component からの辞書検索を api に中継する

```ts
export const GET = async (req: NextRequest) => {
  const parsed = lookupDictionaryQueryStringSchema.safeParse({ word: req.nextUrl.searchParams.get("word") })
  if (!parsed.success) return NextResponse.json({ error: "Invalid word" }, { status: 400 })
  try {
    return NextResponse.json(await dictionaryApi.lookup(parsed.data.word))
  } catch (error) {
    /**
     * 辞書に無い（api の 404）は正常な結果なので 200 の null にする（クライアントが「辞書に見つかりませんでした。」を出す）。
     * 404 のまま返すと、押すたびにブラウザが console に読み込みの失敗として出してしまう
     */
    if (error instanceof ApiClientError && error.status === 404) return NextResponse.json(null)
    if (error instanceof ApiClientError) return NextResponse.json(error.body ?? {}, { status: error.status })
    throw error
  }
}
```

### 2. ページ（`src/app/attempts/[id]/page.tsx`）

Server Component。`getAttemptPathParamSchema` で検証し、失敗・404 は `notFound()`。

| `status` | 表示 |
| --- | --- |
| `in_progress` | `<SolvingScreen attempt={attempt} />`（共通ヘッダーは出さない） |
| `submitted` | `redirect(\`/attempts/${id}/result\`)` |
| `expired` | 「この挑戦は期限切れです」と「問題を開く」（`/passages/{passage.id}`）の簡単な画面。もう提出できないので `ClearAttemptProgress`（結果画面と共通の Client Component）で端末の途中経過を消す |

### 3. 本文リーダーの拡張（`src/components/features/passage/PassageReader.tsx`）

移植済みのリーダーを次のように変える（見た目は変えない）。ログイン画面のデモは、デモ用のデータを同じ形（API の型）で静的に持たせて渡すように直す。

```ts
type PassageReaderProps = {
  blocks: AttemptBlock[]
  fontSize?: ReaderFontSize
  glossary: AttemptGlossaryEntry[]
  /** 結果画面の根拠。セグメントの添字の範囲 */
  highlight?: { blockIndex: number; segmentEnd: number; segmentStart: number } | null
  showAllTranslations?: boolean
  translatedBlocks: Set<number>
  /** 用語集に無い単語を引く。親がキャッシュと通信を持つ */
  onLookupDictionary: (word: string) => Promise<{ headword: string; meaningJa: string } | null>
  onLookupWord?: (lookup: WordLookupRecord) => void
  onToggleTranslation?: (blockIndex: number) => void
}
```

- `WordLookupRecord` は step5 の `attempt-progress.ts` に `export type WordLookupRecord = AttemptProgress["wordLookups"][number]` として置く
- セグメントは API の `blocks[].segments` をそのまま描画する（モックの `segmentText` / `lookUpDictionary` は使わない。分割は api の 1 か所だけ）。`code` のブロックは `text` をハイライトして描画する
- 段落番号は `blocks[].paragraph_number`
- 単語を押したら：`glossary_entry_id` があれば `glossary` から引いて「この文での意味」、無ければ `await onLookupDictionary(text)` で「英和辞書（一般的な意味）」、null なら「辞書に見つかりませんでした。」。カードは結果を待つ間も押した位置に出し、意味の部分だけ後から埋める
- `onLookupWord` は見つかったときだけ呼ぶ（用語集：`{ glossaryEntryId, lemma, source: "glossary", surface }`、辞書：`{ glossaryEntryId: null, lemma: headword, source: "dictionary", surface }`）
- 和訳（`translation_ja`）のインラインコードは、バッククォートで分けて `code` の見た目にする（表示だけの処理）
- 根拠のハイライトは、`highlight.blockIndex` のブロックで添字が `[segmentStart, segmentEnd)` のセグメントを `<mark>` で包む（step7 で使う）

### 4. 解答画面（`src/components/features/attempt/`）

モックの `SolvingScreen.tsx` を部品に分けて移植し、`MOCK_*` を `attempt`（`InProgressAttempt`）に置き換える。

| ファイル | 中身 |
| --- | --- |
| `SolvingScreen.tsx` | `"use client"`。状態を持つ親。上部バー・本文・設問パネル・スマホ幅の設問シート・ステータスバー・ダイアログを並べる |
| `TimerReadout.tsx` / `QuestionPanel.tsx` / `QuestionSheet.tsx` / `PauseOverlay.tsx` / `SubmitConfirmDialog.tsx` / `ShortcutsDialog.tsx` / `ExpiredDialog.tsx` | モックの同名の部分（`ExpiredDialog` だけ新規。見た目は提出の確認と同じダイアログ） |
| `use-active-seconds.ts` | タイマーの hook |
| `use-attempt-shortcuts.ts` | キーボード操作の hook |
| `src/components/ui/Keycap.tsx` | モックの `parts.tsx` の `Keycap`（ステータスバーとショートカットのダイアログのキー表示） |

**状態**（`SolvingScreen`）：`answers: Record<number, number>`、`currentIndex`、`elapsedSeconds`、`isPaused`、`isConfirmOpen`、`isShortcutsOpen`、`isSheetOpen`、`showAllTranslations`、`translatedBlocks`（表示中）、`viewedTranslationBlocks`（一度でも和訳を見た段落）、`wordLookups`、`fontSize`、`isHydrated`、`isExpired`。

**タイマー**

```ts
/** 画面が表示中（document.visibilityState === "visible"）かつ isRunning の間だけ 1 秒ごとに加算する */
export function useActiveSeconds({ initialSeconds, isRunning }: { initialSeconds: number; isRunning: boolean }): number
```

- `isRunning = isHydrated && !isPaused && !isExpired && !isSubmitting`
- 残り = `time_limit_seconds - elapsedSeconds`。残りが 20% 以下で警告の色、0 未満で「超過 +m:ss」と `wrong` の全幅の進捗線（表示の切り替えはモックの `TimerReadout` と同じ）。0 になっても止めない
- 一時停止中は `PauseOverlay` で本文と設問を覆い隠す（透かさない）

**端末への保存**（step5 の `attempt-progress.ts`）

- マウント後の `useEffect` で `readAttemptProgress(attempt.id)` を読み、`answers` / `elapsedSeconds` / `viewedTranslationBlocks` / `wordLookups` を戻してから `isHydrated = true` にする（サーバー描画とのずれを防ぐ。それまでタイマーは動かさない）
- 以降、これらが変わるたびに `writeAttemptProgress` する（経過秒数は毎秒）。`visibilitychange` で hidden になったときにも書く
- 別の端末で始めた挑戦は保存が無いので 0 から始まる（壁時計の上限はサーバーで効く）

**期限（24 時間）**

- マウント時に `serverOffsetMs = Date.parse(attempt.server_now) - Date.now()` を求め、1 分ごとに `Date.now() + serverOffsetMs >= Date.parse(attempt.expires_at)` を確かめる。期限を過ぎたら `isExpired = true` にして `ExpiredDialog`（「この挑戦は期限切れになりました」と「問題を開く」）
- 期限切れになったら（期限の確認・提出の 409 のどちらでも）`removeAttemptProgress(attempt.id)` で端末の途中経過を消し、それ以降は書かない（もう提出できないので、残すと localStorage に溜まるだけ）

**アシスト**

- 段落の「訳」：`translatedBlocks` を切り替え、`viewedTranslationBlocks` に足す。全文訳（ボタン / `T`）をオンにしたら code 以外の全ブロックを `viewedTranslationBlocks` に足す
- 単語：`onLookupWord` で `wordLookups` に追加（同じ単語でも毎回足す。結果画面の一覧はサーバーが重複を除く）
- 辞書は hook `useDictionaryLookup()`（`src/components/features/passage/use-dictionary-lookup.ts`。step7 の結果画面でも使う）が返す関数を `onLookupDictionary` に渡す。中身は `fetch(\`/api/dictionary?word=${encodeURIComponent(word)}\`)` で、200 は結果（辞書に無ければ Route Handler が 200 の null を返すので null）、400（api が単語として受け付けない形）も null。結果（null も含む）は `useRef<Map<string, ...>>` に画面を開いている間だけ持つ（[英和辞書](../README.md#英和辞書) のキャッシュ）。通信の失敗はキャッシュしない
- ステータスバーの「和訳 n 段落」は `viewedTranslationBlocks.size`、「単語 n 回」は `wordLookups.length`

**キーボード操作**（`useAttemptShortcuts`。モックの `handleKeydown` を移す）

- `1`〜`4` 回答、`J` / `K` 設問の移動、`T` 全文訳、`?` ショートカット一覧、`Ctrl` / `⌘` + `Enter` 提出の確認、`Esc` ダイアログを閉じる（単語のカードはリーダーが閉じる）
- 入力欄にフォーカスがあるとき・一時停止中・期限切れのときは何もしない。ダイアログが開いている間は `Esc` だけ受け付ける

**文字サイズ**：`localStorage` の `reader-font-size` に保存する（`try / catch`。読めなければ「中」）。

**出典**：本文の下にモックと同じ 1 行の注記。ソース名は `attribution.page_url`、ライセンス名は `attribution.license_url` へのリンクにし、取得時点（GitHub はコミットの短い SHA で `permalink_url` へのリンク、サイトは「YYYY-MM-DD 時点」）を添える（[出典表示](../../content-collection/README.md#出典表示)）。

**中断**：`/passages` へのリンク。途中経過は保存済み。

### 5. 提出（`src/app/attempts/[id]/actions.ts`）

```ts
"use server"

export type SubmitAttemptActionResult = { error: "expired" | "failed" }

export const submitAttemptAction = async (attemptId: number, input: SubmitAttemptRequest): Promise<SubmitAttemptActionResult> => {
  const parsed = submitAttemptRequestSchema.safeParse(input)
  if (!parsed.success) return { error: "failed" }
  try {
    await attemptApi.submit(attemptId, parsed.data)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return { error: "expired" }
    return { error: "failed" }
  }
  /** 解答画面のキャッシュを捨てる（「戻る」で提出済みの挑戦の解答画面を出さず、取り直して結果画面へ redirect させる） */
  revalidatePath(`/attempts/${attemptId}`)
  redirect(`/attempts/${attemptId}/result`)
}
```

- `SubmitConfirmDialog` の「提出する」で、`answers`（全設問。未回答は `selected_choice_index: null`）・`active_seconds: elapsedSeconds`・`translated_block_count: viewedTranslationBlocks.size`・`word_lookups` を組み立てて呼ぶ。送信中はボタンを無効にし、タイマーを止める
- `expired` は `ExpiredDialog`、`failed` はダイアログ内に「提出できませんでした。時間をおいて再度お試しください。」（回答は端末に残っているので再送できる。提出 API は冪等）
- 端末の途中経過は結果画面（step7）が消す（ここで消すと、提出に失敗したときに回答が失われる）。`expired` のときは解答画面が消す（上の「期限」）

## 動作確認

```bash
pnpm --filter web build
pnpm lint:fix
```

`verify-web-page` skill の手順で確認する（PC 幅 1280px とスマホ幅 390px）。

- [ ] `/attempts/{id}` に着地し、`console_messages` の error が 0 件。見た目がモックの各状態（通常・残り 20% 未満・時間超過・一時停止・提出確認）と同じ
- [ ] タイマーが 1 秒ごとに減る。別のタブに切り替えて 10 秒後に戻ると、その間は減っていない。一時停止で止まり、本文と設問が隠れる
- [ ] 残り 20% 以下で琥珀、0 を過ぎると「超過 +0:01」とローズの全幅の線になり、解答を続けられる
- [ ] 回答を選んでリロードすると、回答と経過秒数が戻る。別のブラウザ（保存なし）で開くと 0 から
- [ ] 段落の「訳」・全文訳・`T` で和訳に切り替わり、ステータスバーの段落数が増える
- [ ] 用語集の語句（熟語は構成するどの単語でも）を押すと「この文での意味」、無い単語は辞書の意味（Network に `/api/dictionary` が出る。同じ単語の 2 回目は通信しない）、辞書に無い単語は「辞書に見つかりませんでした。」。インラインコード・コードブロックは押しても何も出ない
- [ ] 語義設問の対象語句を押すと、用語集ではなく辞書の意味が出る
- [ ] `1`〜`4` / `J` / `K` / `T` / `?` / `Esc` / `⌘` + `Enter` が README の表どおりに動く。一時停止中は効かない
- [ ] スマホ幅では設問がシートになり、「Q3 を開く」で画面の 78% まで開く。提出はシートの中
- [ ] 未回答があると「未回答の設問が 1 問あります」。提出すると `/attempts/{id}/result` に移る（結果画面は step7）。DB の `elapsed_seconds` が画面の経過秒数と合い、`translated_block_count`・`attempt_word_lookups` が操作どおり
- [ ] 提出済みの挑戦の `/attempts/{id}` を開くと結果画面へ移る。`started_at` を 24 時間前にした挑戦は期限切れの表示で、localStorage の `attempt-progress:{id}` が消える
- [ ] 提出して結果画面に移ったあと、ブラウザの「戻る」で解答画面が出ず結果画面へ移る
- [ ] スクリーンショットを `docs/screenshots/reading-practice-attempt/after.png` に撮る（新規ページのため before なし）
