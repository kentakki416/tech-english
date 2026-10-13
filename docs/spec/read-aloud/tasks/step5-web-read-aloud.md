# step5-web-read-aloud

web の解答画面（`/attempts/[id]`）と結果画面（`/attempts/[id]/result`）に読み上げを足す。本文の列の下端のミニプレーヤー（再生・停止・速度）、段落番号の列の段落の再生ボタン、読み上げ中の単語のハイライト、自動スクロールと「読み上げ中の位置に戻る」、聞いた段落の記録。

- 仕様：[再生の操作](../README.md#再生の操作)・[ハイライトとスクロール](../README.md#ハイライトとスクロール)・[タイマー・一時停止・和訳との関係](../README.md#タイマー一時停止和訳との関係)・[使える場面とアシストの扱い](../README.md#使える場面とアシストの扱い)
- 見た目：[UI 設計](../README.md#ui-設計)（モックは `apps/web/src/app/mock/_components/ReadAloud.tsx` と `PassageReader.tsx`・`attempts/[id]/SolvingScreen.tsx`・`result/ResultScreen.tsx`）
- 実装の方針：[再生の実装](../README.md#再生の実装)

## 前提

- [step4-api-attempt-audio](./step4-api-attempt-audio.md)：`GET /api/attempt/:id/audio`、提出の `listened_block_count`（リクエストとレスポンス）、`@repo/api-schema` の `getAttemptAudioPathParamSchema`・`getAttemptAudioResponseSchema`、開発環境の `/media/*` 配信
- 手動確認の音声は [step3-cron-generate-audio](./step3-cron-generate-audio.md) の `TTS_PROVIDER=fake pnpm --filter cron generate:audio` で作る（無音の mp3 と等間隔の単語の時刻）
- [reading-practice step6-web-attempt](../../reading-practice/tasks/step6-web-attempt.md)（`SolvingScreen`・`PassageReader`・`attempt-progress.ts`・`use-attempt-shortcuts.ts`・`ShortcutsDialog`）・[step7-web-result](../../reading-practice/tasks/step7-web-result.md)（`ResultScreen`）

## 対応内容

### 1. 音声のマニフェストの取得（Route Handler）

ブラウザから api を直接呼ばない（[apps/web/CLAUDE.md の API 通信ルール](../../../../apps/web/CLAUDE.md#api-通信ルール)）。Client Component は Route Handler を経由する。

`src/features/attempt/attempt.api.ts` に足す：

```ts
/**
 * 挑戦の問題の読み上げの音声。準備中・失敗は status だけ。他人の挑戦・存在しない ID は API が 404（ApiClientError）
 */
getAudio: async (id: number): Promise<GetAttemptAudioResponse> => {
  const raw = await apiClient.get<unknown>(`/api/attempt/${id}/audio`)
  return getAttemptAudioResponseSchema.parse(raw)
},
```

`src/app/api/attempts/[id]/audio/route.ts`（新規）：

```ts
import { NextRequest, NextResponse } from "next/server"

import { getAttemptAudioPathParamSchema } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * GET /api/attempts/:id/audio
 *
 * 解答画面・結果画面が、開いた後に読み上げの音声のマニフェストを取得する BFF（挑戦の取得のレスポンスを重くしないため別にする）
 */
export const GET = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const parsed = getAttemptAudioPathParamSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  try {
    return NextResponse.json(await attemptApi.getAudio(parsed.data.id))
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: error instanceof ApiClientError ? error.status : 500 },
    )
  }
}
```

- `proxy.ts` の `PUBLIC_PATHS` には足さない（access token の更新は proxy が行い、refresh token が使えなければ 401 を返す）
- mp3 そのものはブラウザが `url`（本番は CloudFront、開発は api の `/media/*`）から直接読む。api の JSON の API ではないので、上のルールの対象外

### 2. 時刻表の純関数（`src/features/read-aloud/read-aloud-timeline.ts`）

マニフェストとブロックのセグメントから、再生に使う時刻表を作る。ブラウザでだけ使うが、DOM に触れない純関数にする（`server-only` も `"use client"` も付けない）。web にはユニットテストが無いので、[動作確認](#動作確認) の画面の確認で確かめる。

```ts
import type { AttemptBlock, GetAttemptAudioResponse, PassageSegmentResponse } from "@repo/api-schema"

type ReadyAudio = Extract<GetAttemptAudioResponse, { status: "ready" }>

/**
 * 1 語の時刻と、ハイライトするセグメントの添字の範囲 [segmentStart, segmentEnd)
 */
export type TimelineWord = {
  endMs: number
  segmentEnd: number
  segmentStart: number
  startMs: number
}

export type TimelinePart = {
  durationMs: number
  url: string
  words: TimelineWord[]
}

export type TimelineBlock = {
  blockIndex: number
  /**
   * パートの長さの合計
   */
  durationMs: number
  parts: TimelinePart[]
}

export type ReadAloudTimeline = {
  /**
   * 読み上げるブロック（コードブロックと、パートの無いブロックは含めない）を本文の順に
   */
  blocks: TimelineBlock[]
  totalDurationMs: number
}

/**
 * セグメントの元の本文（blocks[].text）での位置 [start, end)。
 * api はインラインコードのセグメントからバッククォートを除いて返すので、code は 2 文字を足す（順に連結すると text に戻る）
 */
const buildSegmentRanges = (segments: PassageSegmentResponse[]): { end: number, start: number }[] => { /* 累積 */ }

/**
 * 単語の時刻の位置 [startOffset, endOffset)（blocks[].text 上の UTF-16 の位置）と重なる、単語・インラインコードのセグメントの範囲。
 * 空白・記号だけと重なるもの（無いはず）は null にして、ハイライトしない
 */
const convertOffsetsToSegmentRange = (...) => { /* ... */ }

export const buildReadAloudTimeline = (blocks: AttemptBlock[], audio: ReadyAudio): ReadAloudTimeline => { /* ... */ }

/**
 * 再生位置（パートの先頭からのミリ秒）で読んでいる単語の添字。startMs が位置以下の最後の単語を二分探索で引く。最初の単語より前は -1
 */
export const findWordIndexAt = (words: TimelineWord[], positionMs: number): number => { /* ... */ }

/**
 * ミニプレーヤーの進捗（0〜1）。全文は本文全体、段落はそのブロックの中での位置
 */
export const calculateReadAloudProgress = (
  timeline: ReadAloudTimeline,
  position: { blockIndex: number, mode: "all" | "block", partIndex: number, positionMs: number },
): number => { /* ... */ }
```

- `buildReadAloudTimeline`：マニフェストの `block_index` が範囲外・コードブロックのものは捨てる。単語は `convertOffsetsToSegmentRange` が null のものを捨てる（時刻表から抜けるだけで、その単語の間は前の単語のハイライトが残る）。パートが 0 のブロックは含めない。`blockIndex` の昇順に並べる
- 単語は Polly の順（時刻の昇順）のまま。`findWordIndexAt` はこれを前提にする

### 3. 再生速度の保存（`src/components/features/read-aloud/use-read-aloud-rate.ts`）

`use-reader-font-size.ts` と同じ作り（`useSyncExternalStore` + `localStorage`、キーは `read-aloud-rate`）。

```ts
export type ReadAloudRate = 0.75 | 1 | 1.25

export const READ_ALOUD_RATES: readonly ReadAloudRate[] = [0.75, 1, 1.25]

/**
 * 読み上げの速度と、それを変えて保存する関数。サーバーと hydration 中・保存が無い・読めないときは 1 倍
 */
export function useReadAloudRate(): [ReadAloudRate, (rate: ReadAloudRate) => void]
```

### 4. 再生の hook（`src/components/features/read-aloud/use-read-aloud.ts`）

解答画面と結果画面で共有する。音声の取得・再生・単語の追跡・聞いた段落の通知をまとめる。

```ts
"use client"

/**
 * 音声の情報の状態。loading は画面を開いてから取得が終わるまで、error は取得か再生の失敗（再生ボタンで取り直す）
 */
export type ReadAloudAvailability = "error" | "failed" | "loading" | "pending" | "ready"

export type ReadAloudPlayback = {
  blockIndex: number
  isPlaying: boolean
  mode: "all" | "block"
  partIndex: number
  /**
   * 読み上げ中の単語（パートの words の添字）。最初の単語より前は -1
   */
  wordIndex: number
}

type UseReadAloudOptions = {
  attemptId: number
  blocks: AttemptBlock[]
  /**
   * 解答画面だけ渡す。ブロックの中の再生位置が 1 秒を超えたとき、ブロックごとに 1 回呼ぶ
   */
  onBlockListened?: (blockIndex: number) => void
}

export function useReadAloud({ attemptId, blocks, onBlockListened }: UseReadAloudOptions): {
  availability: ReadAloudAvailability
  /**
   * 待機中は null
   */
  playback: ReadAloudPlayback | null
  progress: number
  rate: ReadAloudRate
  /**
   * 読み上げ中の単語のハイライト（PassageReader に渡す）。単語が無いとき null
   */
  reading: { blockIndex: number, segmentEnd: number, segmentStart: number } | null
  pause: () => void
  playBlock: (blockIndex: number) => void
  setRate: (rate: ReadAloudRate) => void
  stop: () => void
  togglePlay: () => void
}
```

**取得**

- マウント時に `fetch(`/api/attempts/${attemptId}/audio`)` し、`getAttemptAudioResponseSchema` で検証する。`ready` → `buildReadAloudTimeline` で時刻表を作り `ready`（時刻表のブロックが 0 なら `failed`）、`pending` / `failed` はそのまま、通信の失敗・200 以外・検証の失敗は `error`
- 画面を離れた後に届いた結果は捨てる（`AbortController` で中断する）

**再生**

- `HTMLAudioElement` を 1 つ（初めて再生するときに `new Audio()`）。`preservesPitch = true`。パートを始めるたびに `src` を差し替え、`playbackRate` を今の速度にしてから `play()` する。`play()` の Promise の失敗（自動再生の制限など）は一時停止の扱いにする
- 次のパート（同じブロックの次のパート、全文なら次のブロックの最初のパート）の `Audio` を `preload = "auto"` で先に作っておく（ブラウザのキャッシュに載せるため。再生はしない）
- `isPlaying` は自分の操作ではなく、`audio` の `play` / `pause` イベントで決める（イヤホンが外れたなど、ブラウザが止めたときも表示を合わせる）
- `ended`：同じブロックに次のパートがあればそれを、全文なら次のブロックを再生する。段落の再生・最後のブロックなら `stop()`
- `error`：再生を止めて `availability = "error"`（時刻表は残す）

**単語の追跡**

- 再生中だけ `requestAnimationFrame` で `audio.currentTime` を読み、`findWordIndexAt` で単語を引く。**単語が変わったときだけ** `setPlayback` する（毎フレーム描き直さない）
- 聞いた段落：ブロックの中の再生位置（前のパートの長さの合計 + `currentTime`）が 1,000ms 以上になったら、まだ通知していないブロックなら `onBlockListened(blockIndex)` を呼ぶ（通知したブロックは ref の `Set` に持つ。親が重複を除くので、二重に呼んでも害は無い）
- `reading` は `playback` の単語の `segmentStart` / `segmentEnd`。`progress` は `calculateReadAloudProgress` に単語の `startMs` を位置として渡す（単語の単位で進み、ミニプレーヤーが幅の変化を 300ms で補間する）

**操作**

| 関数 | 動き |
| --- | --- |
| `togglePlay` | `availability` が `error` なら、時刻表があれば `ready` に戻して全文を最初から、無ければ取り直す（再生はしない）。待機中なら全文を最初のブロックから。再生中なら一時停止、一時停止中なら続きから |
| `playBlock(i)` | `i` を段落だけで再生中・一時停止中なら `togglePlay` と同じ。それ以外は今の再生を止めて `i` を段落だけで最初から。時刻表に無いブロックは何もしない |
| `pause` | 一時停止（待機中は何もしない） |
| `stop` | 一時停止して `src` を外し、`playback = null` |
| `setRate` | 保存して、再生中の `audio.playbackRate` も変える（再生は止めない） |

- `visibilitychange` で `hidden` になったら `pause()`
- アンマウントで一時停止し、`requestAnimationFrame` を止め、`src` を外す

### 5. PassageReader（`src/components/features/passage/PassageReader.tsx`）

props に読み上げを足す。渡さなければ今までどおり（ログイン画面のデモは渡さない）。

```ts
export type ReaderReadAloud = {
  /**
   * 読み上げ中（一時停止中を含む）のブロック。待機中は null
   */
  activeBlockIndex: number | null
  /**
   * false のとき段落の再生ボタンを無効にする（準備中・失敗・取得中）
   */
  isAvailable: boolean
  /**
   * 段落だけを再生している最中のブロック（その段落の再生ボタンを一時停止のアイコンにする）
   */
  playingBlockIndex: number | null
  /**
   * 読み上げ中の単語のハイライト
   */
  reading: { blockIndex: number, segmentEnd: number, segmentStart: number } | null
  onPlayBlock: (blockIndex: number) => void
}
```

- `MemoizedReaderBlock` にはブロックごとの値だけを渡す：`isReadingBlock`・`isPlayingBlock`・`readingSegmentStart` / `readingSegmentEnd`（読み上げ中のブロックだけ。それ以外は null）・`isReadAloudAvailable`・`onPlayBlock`（親が `useCallback` で固定する）。単語が変わっても描き直すのは読み上げ中のブロックだけになる
- **和訳**：`isTranslated` を `!isReadingBlock && （今の条件）` にする（読み上げ中の段落は和訳中・全文訳でも英文で出す。`translatedBlocks` 自体は変えない）
- **段落の再生ボタン**：段落番号の列の「訳」の下。`block.type !== "code"` かつ `onPlayBlock` があるとき。見た目・出し方はモックの `PassageReader.tsx` のとおり（22px 角、PC はホバー・フォーカスで出す、`[@media(hover:none)]:opacity-60`、読み上げ中のブロックは琥珀で常に出す、`disabled={!isReadAloudAvailable}`）。`aria-label` は「この段落を読み上げ」/「この段落の読み上げを一時停止」、`aria-pressed={isPlayingBlock}`。押したら `event.stopPropagation()`（article の単語のクリックに渡さない）
- **単語のハイライト**：`renderSegments` に読み上げの範囲を渡し、通しの添字（`offset + index`）が `[readingSegmentStart, readingSegmentEnd)` のセグメントに `bg-amber/15 shadow-[inset_0_-2px_0_var(--color-amber)]` を足す。単語の `<span>` とインラインコードの `<code>` の両方。根拠の `<mark>` で分けた中でも通しの添字で判定する
- 単語のカードを開いた単語の印（`data-active`）は今までどおり。読み上げの印とは別に付く

### 6. ミニプレーヤー（`src/components/features/read-aloud/ReadAloudBar.tsx`）

モックの `ReadAloud.tsx` の `ReadAloudBar`・`SpeedMenu`・`ReturnToReadingButton` を本実装に移す（擬似再生の `useReadAloudMock` は持ってこない）。

```ts
export function ReadAloudBar(props: {
  availability: ReadAloudAvailability
  blocks: AttemptBlock[]
  isShortcutVisible: boolean
  playback: ReadAloudPlayback | null
  progress: number
  rate: ReadAloudRate
  onRateChange: (rate: ReadAloudRate) => void
  onStop: () => void
  onToggle: () => void
}): React.ReactNode

export function ReturnToReadingButton({ onClick }: { onClick: () => void }): React.ReactNode
```

| `availability` / 再生 | 表示 |
| --- | --- |
| `pending` | 灰の再生ボタン（押せない）と「読み上げの音声を準備中です」。停止・速度は出さない |
| `failed` | 同じ見た目で「この問題の読み上げは利用できません」 |
| `loading` | 待機の見た目で、再生ボタンだけ `disabled` |
| `error` | 待機の見た目で、ラベルを「読み上げを読み込めませんでした」 |
| `ready`・待機 | 「全文を読み上げ」 |
| `ready`・再生中 / 一時停止中 | 「段落 n / N」（`blocks[blockIndex].paragraph_number` と、`paragraph_number` を持つブロックの数。見出しは「見出し」）、下の行に「全文」/「この段落だけ」、停止ボタン |

- 再生ボタンの `aria-label`：「全文を読み上げ」/「読み上げを一時停止」/「読み上げを再開」
- 速度のメニュー：`role="menu"` と `menuitemradio`。外のクリック・`Esc` で閉じる（`Esc` は単語のカードの `Esc` と同時に効いてよい）
- `R` のキーキャップは `isShortcutVisible` のときだけ、`lg` 以上で出す

### 7. 自動スクロール（`src/components/features/read-aloud/use-reading-auto-scroll.ts`）

```ts
/**
 * 読み上げ中の段落を追ってスクロールする。ユーザーが本文を動かしたら止め、「読み上げ中の位置に戻る」で再開する
 */
export function useReadingAutoScroll(activeBlockIndex: number | null): {
  isFollowing: boolean
  /**
   * 本文のスクロール領域（main）に付ける
   */
  scrollHandlers: { onTouchMove: () => void, onWheel: () => void }
  resumeFollowing: () => void
}
```

- `activeBlockIndex` が変わり、追っている間は `document.getElementById(`block-${i}`)?.scrollIntoView({ behavior, block: "start" })`。ブロックの `section` の `scroll-mt-24` で上に余白が残る。`behavior` は `prefers-reduced-motion: reduce` なら `"auto"`、それ以外は `"smooth"`
- 読み上げ中（`activeBlockIndex !== null`）に、`wheel` / `touchmove`（main に付ける）と、`window` の `keydown` のスクロールのキー（`ArrowDown` `ArrowUp` `PageDown` `PageUp` `Home` `End` `" "`。入力欄・修飾キーつきは除く）で追うのを止める。`scrollIntoView` が起こすスクロールは `scroll` イベントだけなので止まらない
- `resumeFollowing`：追うのを再開し、すぐに読み上げ中の段落までスクロールする
- 読み上げが終わったら（`activeBlockIndex` が null）追う状態に戻す
- 呼び出し側は、待機中に再生を始めたとき・段落の再生ボタンを押したときにも `resumeFollowing` を呼ぶ

### 8. 途中経過（`src/features/attempt/attempt-progress.ts`）

```ts
export type AttemptProgress = {
  /** （今の項目は変えない） */
  /**
   * 読み上げを 1 秒以上聞いたブロックの添字。読み上げより前の版で保存したものには無い
   */
  listenedBlockIndexes?: number[]
}
```

- **版（`ATTEMPT_PROGRESS_VERSION`）は上げない**。上げると解答中の挑戦の途中経過（回答・経過秒数）が読めなくなるため
- `isAttemptProgress` は `listenedBlockIndexes` が無いか、数の配列なら通す

### 9. 解答画面（`src/components/features/attempt/SolvingScreen.tsx`）

- `restoreProgress` で `listenedBlockIndexes` を戻す（重複を除き、`block.type !== "code"` のブロックだけ）。`listenedBlocks`（`Set<number>`）を state に持ち、途中経過の保存に含める
- `const readAloud = useReadAloud({ attemptId: attempt.id, blocks: attempt.blocks, onBlockListened: recordListenedBlock })`。`recordListenedBlock` は `useCallback` で、すでにある添字なら state を変えない
- `const autoScroll = useReadingAutoScroll(readAloud.playback?.blockIndex ?? null)`。`main` に `{...autoScroll.scrollHandlers}`
- 再生の開始：ミニプレーヤーの再生・`R` は、待機中なら `autoScroll.resumeFollowing()` してから `readAloud.togglePlay()`。段落の再生ボタンは `resumeFollowing()` してから `readAloud.playBlock(i)`
- 上部バーの一時停止：一時停止にするときに `readAloud.pause()`。再開（上部バー・`PauseOverlay`）では読み上げを再開しない
- 期限切れになったら `readAloud.stop()`。提出の Server Action を呼ぶ前に `readAloud.stop()`
- 提出：`listened_block_count: listenedBlocks.size`
- ミニプレーヤーの置き場所：`main` の中の本文と出典の後ろに、モックと同じ `sticky bottom-0` の入れ物（`pointer-events-none` の外側と `pointer-events-auto` の内側、`max-w-3xl` と段落番号の列の分の `pl-11 sm:pl-14`）。中に、追うのを止めていて読み上げ中なら `ReturnToReadingButton`、その下に `ReadAloudBar`（`isShortcutVisible`）
- `main` の下の余白を `pb-28 lg:pb-16` から `pb-20 lg:pb-5` にする。sticky の止まる位置はスクロール領域の padding の内側なので、スマホ幅は閉じた設問シート（64px）の上、PC は下端から 20px に止まる。一時停止中は `main` が `inert` なのでミニプレーヤーも押せない
- `useAttemptShortcuts` に `onToggleReadAloud` を足し、`r` で呼ぶ（`isEnabled` のときだけ。準備中・失敗・取得中は何もしない）
- ステータスバー：左に `読み上げ {listenedBlocks.size} 段落`（単語の回数の後ろ）、右に `<Keycap>R</Keycap>読み上げ`（全文訳の後ろ）
- `ShortcutsDialog` の一覧に `{ keys: ["R"], label: "読み上げの再生・一時停止" }`（`T` の後ろ）

### 10. 結果画面（`src/components/features/attempt/ResultScreen.tsx`）

- `const readAloud = useReadAloud({ attemptId: result.id, blocks: result.blocks })`（`onBlockListened` は渡さない。結果画面で聞いた段落は数えない）と `useReadingAutoScroll`
- 本文の上の注記を「本文（根拠の箇所をハイライトしています。単語のタップ・和訳・読み上げはここでも使えます）」にする
- アシストの使用に `<p className="text-fg">読み上げ {result.listened_block_count} 段落</p>`（単語の回数の後ろ）
- ミニプレーヤーは解答画面と同じ入れ物で `main` の本文の後ろに置く（`isShortcutVisible={false}`）。止まる位置は `bottom-[81px] lg:bottom-0`（スマホ幅はページの末尾に固定した「もう一度解く」「次の問題を解く」〈高さ 69px〉の上に 12px あける）。`main` の下の余白を `pb-16` から `pb-5` にする
- `main` に `{...autoScroll.scrollHandlers}`（スマホ幅はページ全体がスクロールするが、本文の上でのホイール・タッチで止まれば足りる）

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter web lint
pnpm --filter web build
```

`verify-web-page` skill の手順で、Playwright MCP で実画面を確かめる。api・DB・web を起動し、公開済みの問題に `TTS_PROVIDER=fake pnpm --filter cron generate:audio` で音声を作る（無音なので、確かめるのはハイライト・表示・記録）。インラインコードを含む段落がある問題を 1 つ選ぶ。

**解答画面**

- [ ] 開いた直後に `/api/attempts/:id/audio` が 1 回呼ばれ、ミニプレーヤーが「全文を読み上げ」になる（取得中は再生ボタンが無効）
- [ ] 再生：最初の見出しからハイライトが単語ごとに進み、ラベルが「見出し」→「段落 1 / N」、下の行が「全文」、進捗が進む。段落が変わるたびにその段落の始まりまでスクロールし、最後の段落で待機に戻る
- [ ] インラインコードを含む段落で、コードとその後の単語にハイライトがずれずに付く
- [ ] 段落の再生ボタン：その段落だけを読み、「この段落だけ」と出て、読み終えると待機に戻る。読んでいる間はボタンが一時停止のアイコンで、押すと一時停止・再開
- [ ] 全文の再生中に別の段落の再生ボタンを押すと、その段落の最初から段落だけの再生に切り替わる
- [ ] 再生ボタンと `R` で一時停止・再開。停止で待機に戻り、ハイライトが消える
- [ ] 速度のメニューで 1.25x にすると、ハイライトの進みが速くなる（等間隔の単語が 0.8 倍の時間で進む）。再読み込みしても 1.25x のまま（`localStorage` の `read-aloud-rate`）
- [ ] 和訳を表示中の段落を読むと、読んでいる間だけ英文になり、次の段落に進むと和訳に戻る。全文訳がオンでも同じ
- [ ] 読み上げ中にホイールでスクロールすると「読み上げ中の位置に戻る」が出て、自動スクロールが止まる。押すと読み上げ中の段落に戻り、追うのを再開する。設問パネルのスクロールでは止まらない
- [ ] ハイライト中の単語を押すと単語のカードが出て、再生は止まらない
- [ ] 上部バーの一時停止で読み上げも止まり、再開しても読み上げは止まったまま
- [ ] `document.visibilityState` を `hidden` にして `visibilitychange` を送ると一時停止する（`browser_evaluate` で `Object.defineProperty` してから dispatch）
- [ ] 聞いた段落：1 秒を超えて聞いた段落ごとにステータスバーの「読み上げ n 段落」が増え、押してすぐ止めた段落は増えない。再読み込み（再開）しても数が残る
- [ ] 読み上げより前の形の途中経過（`listenedBlockIndexes` の無い JSON を `localStorage` に入れる）でも回答と経過秒数が戻る
- [ ] 提出すると結果画面に「読み上げ n 段落」が出て、`reading_attempts.listened_block_count` が n（psql）
- [ ] `passage_audios` の行を消すと「読み上げの音声を準備中です」になり、再生ボタン・段落の再生ボタン・`R` が効かない。`status = 'failed'` で「この問題の読み上げは利用できません」
- [ ] api を止めて開くと「読み上げを読み込めませんでした」。api を戻して再生ボタンを押すと取り直して「全文を読み上げ」に戻る
- [ ] mp3 を 1 つ消して再生すると、そのパートで止まって「読み上げを読み込めませんでした」
- [ ] `browser_emulate_media` で `reducedMotion: "reduce"` にすると、自動スクロールがアニメーションしない
- [ ] 幅 390px：ミニプレーヤーが閉じた設問シートのすぐ上にあり、`R` のキーキャップが無い。設問シートを開くとその下に隠れる
- [ ] ショートカット一覧に `R` がある

**結果画面**

- [ ] 注記・「読み上げ n 段落」・ミニプレーヤー（`R` 無し）が出る。全文・段落の再生、ハイライト、自動スクロールが解答画面と同じく動く
- [ ] 結果画面で聞いても `listened_block_count` は変わらない
- [ ] 幅 390px：本文までスクロールすると、ミニプレーヤーが下端の「もう一度解く」「次の問題を解く」の上に出る

**共通**

- [ ] `browser_console_messages` の error が 0 件
- [ ] PR に `docs/screenshots/read-aloud/` の before / after（解答画面の読み上げ中・準備中、結果画面）を添える
