# step4-web-vocabulary-pronunciation

web の単語帳の 1 回分のカードに、単語の発音と 1 文の読み上げのボタンを足す。再生は `HTMLAudioElement` を 1 つ使い回す hook（`usePronunciation`）にまとめる。

## 前提

- [step3-api-vocabulary-pronunciation](./step3-api-vocabulary-pronunciation.md)（カードの `pronunciation`）
- vocabulary-cards の [step5-web-vocabulary](../../vocabulary-cards/tasks/step5-web-vocabulary.md)（`VocabularySession`・`FlashCard`・`PaperCard`）
- 見た目（ボタンの位置・アイコン・再生中の表示・動き）は README の [UI 設計](../README.md#ui-設計) に従う。モックは `src/app/mock/_components/PronunciationButtons.tsx`
- 仕様は README の [聞けるもの](../README.md#聞けるもの)・[ボタンの操作](../README.md#ボタンの操作)・[再生の実装](../README.md#再生の実装)

## 対応内容

### 1. `usePronunciation`

`src/components/features/vocabulary/use-pronunciation.ts`（Client Component の hook）。

```typescript
/** apps/web/src/components/features/vocabulary/use-pronunciation.ts */
"use client"

/**
 * 再生中のもの。word は単語の発音、sentence は 1 文
 */
export type PronunciationTarget = "sentence" | "word"

/**
 * 1 文の区間の終わりに足す余白（区間の終わりは次の単語の始まりなので、最後の音が切れないように）
 */
const SENTENCE_TAIL_MS = 150

/**
 * カードの発音の再生（vocabulary-pronunciation README「再生の実装」）。1 回分の画面で 1 つだけ持ち、HTMLAudioElement を 1 つ使い回す。
 * 1 文は区間の始めに合わせて再生し、requestAnimationFrame で終わりを過ぎたら止める
 */
export function usePronunciation(): {
  playing: PronunciationTarget | null
  /**
   * 単語の mp3 を先に読んでおく（カードが出たとき）
   */
  preload: (url: string) => void
  stop: () => void
  /**
   * 同じものを再生中なら止める。別のものを再生中なら止めてから鳴らす
   */
  toggle: (target: PronunciationTarget, source: { endMs?: number, startMs?: number, url: string }) => void
}
```

- `toggle`：`src` が違えば差し替え、`currentTime = startMs / 1000`（単語は 0）にしてすぐ `play()` する（Safari は利用者の操作の中で `play()` を呼ばないと鳴らさないので、読み込みを待たない。読み込み前に入れた `currentTime` は再生の開始位置になり、使わないブラウザのために `loadedmetadata` で合わせ直す）。1 文は `requestAnimationFrame` で `currentTime * 1000 >= endMs + SENTENCE_TAIL_MS` になったら `pause()`。単語は `ended` で終わる
- ブラウザや OS が止めたとき（`pause` イベント。イヤホンが外れた・メディアキー）も `playing` を `null` に戻す
- 読み込みに失敗した audio（`error` がある）は、押したときに `load()` で読み込み直す（`play()` だけでは読み込み直さない）
- `play()` の Promise の失敗（自動再生の制限・読み込めない）は `playing` を `null` に戻すだけにする（エラー画面にしない）
- `preload`：単語の URL ごとに `Audio`（`preload = "auto"`）を作って持つ（1 回分は最大 10 語なので上限は置かない）。`toggle` で単語を鳴らすときはそれを使う
- 画面を離れたとき（`visibilitychange` で隠れた）・アンマウントで `stop`

### 2. カードにボタン

- `PaperCardFront`・`PaperCardBack`（`PaperCard.tsx`）に `pronunciation` の props（`onToggle`・`playing`・`pronunciation`）を足し、語句のすぐ右に単語のボタン、1 文のすぐ下に 1 文のボタンを置く（位置は UI 設計）。ボタンは `PronunciationButtons.tsx` に分ける
- 1 文の再生中は `SentenceText` の強調を光らせる（`globals.css` に `--animate-sound-wave`・`--animate-highlight-glow`）
- `word_url` が null の単語のボタンは `disabled` にして「準備中」の `title` / `aria-label` を付ける。`sentence` が null の 1 文のボタンは出さない
- ボタンはカードのクリック（めくる）と重なるので、`onClick` で `event.stopPropagation()` する。`Space` / `Enter` はボタンの操作になる（`use-vocabulary-shortcuts` はボタンにフォーカスがあると無視する）
- 読み上げのラベルは「{見出し語} の発音を聞く」「この文を聞く」。再生中は `aria-pressed`
- キーボードのショートカットは足さない（ボタンに Tab で移れる）

### 3. 止めるとき

- `FlashCard` の `flip`・`answer` で `stop()` を呼ぶ（めくる・答えると止める）
- カードが替わったら（`FlashCard` の `key` が変わる）、新しいカードの `word_url` を `preload` する
- `VocabularySession` が `usePronunciation` を 1 つ持ち、`FlashCard` に渡す。ふりかえり・今日の分が終わった画面では使わない

## 動作確認

```bash
pnpm --filter web lint
pnpm --filter web build
```

Playwright MCP で確かめる（認証は `verify-web-page` skill の手順）。前もって cron の `generate:word-audio` と `generate:audio` を流し（`TTS_PROVIDER` の既定の fake は無音の mp3）、ローカルの `/media` から mp3 が返ることを確かめておく。

- [ ] `/vocabulary/session` に着地し、コンソールのエラーが 0 件
- [ ] 表と裏の両方に単語のボタンが出る。押すとカードはめくれず、`audio` 要素が単語の mp3 を再生する（`paused` が false になる）。もう一度押すと止まる
- [ ] 1 文のボタンを押すと、段落の mp3 を区間の始めから再生し、区間の終わり + 150ms で止まる（`currentTime` で確かめる）
- [ ] 再生中にもう一方のボタンを押すと切り替わる。めくる・答えると止まる
- [ ] `word_audios` の行を消した見出し語は単語のボタンが「準備中」で押せない。`passage_audios` が無い問題のカードは 1 文のボタンが無い
- [ ] `Space` でボタンを押してもカードはめくれない（ボタンの操作になる）
- [ ] 390px 幅で、ボタンが語句・1 文と重ならない

PR には after のスクリーンショット（表・裏・再生中）を入れる（既存ページの変更なので before も撮る）。
