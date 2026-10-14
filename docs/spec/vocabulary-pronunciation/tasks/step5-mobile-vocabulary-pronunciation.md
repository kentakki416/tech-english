# step5-mobile-vocabulary-pronunciation

mobile の単語帳の 1 回分のカードに、単語の発音と 1 文の読み上げのボタンを足す。あわせて、めくる効果音・発音・読み上げの音声のモードを 1 か所で切り替える `requestAudioMode` を作る。

## 前提

- [step3-api-vocabulary-pronunciation](./step3-api-vocabulary-pronunciation.md)（カードの `pronunciation`）
- vocabulary-cards の [step7-mobile-vocabulary](../../vocabulary-cards/tasks/step7-mobile-vocabulary.md)（`VocabularySession`・`FlashCard`・`PaperCard`・`use-flip-sound.ts`）
- read-aloud の [step6-mobile-read-aloud](../../read-aloud/tasks/step6-mobile-read-aloud.md)（`use-read-aloud.ts` の音声のモード）
- 見た目は README の [UI 設計](../README.md#ui-設計) に従う。モックは `src/components/mock/PronunciationButtons.tsx`
- 仕様は README の [ボタンの操作](../README.md#ボタンの操作)・[再生の実装](../README.md#再生の実装)

## 対応内容

### 1. 音声のモードの調停

`src/libs/audio-mode.ts`。今はめくる効果音（`use-flip-sound.ts`）と読み上げ（`use-read-aloud.ts`）がそれぞれ `setAudioModeAsync` を呼び、後から呼んだ方のモードが残る。発音が増えると取り違えが起きる（発音を聞いた後のめくる音が消音モードでも鳴る、読み上げの後のめくる音がほかのアプリの音楽を止める）ので、鳴らす側は必ずこれを通す。

```typescript
/** apps/mobile/src/libs/audio-mode.ts */
import { type AudioMode, setAudioModeAsync } from "expo-audio"

/**
 * 鳴らすものごとの音声のモード（vocabulary-pronunciation README「再生の実装」）
 */
const AUDIO_MODES = {
  /**
   * めくる効果音。消音モードでは鳴らさず、ほかのアプリの音楽と混ぜる（iOS の ambient）
   */
  effect: { interruptionMode: "mixWithOthers", playsInSilentMode: false, shouldPlayInBackground: false },
  /**
   * 単語の発音・1 文。消音モードでも鳴らし、ほかのアプリの音楽は鳴らしている間だけ小さくする
   */
  pronunciation: { interruptionMode: "duckOthers", playsInSilentMode: true, shouldPlayInBackground: false },
  /**
   * 読み上げ。消音モードでも鳴らし、ほかのアプリの音楽は止める
   */
  readAloud: { interruptionMode: "doNotMix", playsInSilentMode: true, shouldPlayInBackground: false },
} as const satisfies Record<string, Partial<AudioMode>>

export type AudioModeKind = keyof typeof AUDIO_MODES

/**
 * 最後に頼んだモードと、その設定の Promise（同じモードなら setAudioModeAsync を呼ばない）
 */
let current: { kind: AudioModeKind, ready: Promise<void> } | null = null

/**
 * 鳴らす前に呼び、返る Promise を待ってから play する（setAudioModeAsync は後から効くので、待たないと前のモードで鳴る）。
 * 失敗しても再生は続ける（warn だけ）
 */
export const requestAudioMode = (kind: AudioModeKind): Promise<void> => {
  if (current?.kind === kind) return current.ready
  const ready = setAudioModeAsync(AUDIO_MODES[kind]).catch((error: unknown) => console.warn("Failed to set audio mode:", error))
  current = { kind, ready }
  return ready
}
```

- `use-flip-sound.ts`：マウント時の `setAudioModeAsync` をやめ、`play` で `requestAudioMode("effect")` を待ってから鳴らす
- `use-read-aloud.ts`：`requestAudioMode`（初めて再生するときに 1 回）の中の `setAudioModeAsync` を `requestAudioMode("readAloud")` にし、再生を始めるたびに呼ぶ（同じモードなら何もしない）
- web 表示では `setAudioModeAsync` が何もしないので、そのままでよい

### 2. `usePronunciation`

`src/features/vocabulary/use-pronunciation.ts`。`expo-audio` の `useAudioPlayer` を 1 つ使い回す。

- `toggle(target, source)`：同じものを再生中なら止める。違えば `requestAudioMode("pronunciation")` を待ち、`player.replace({ uri })` → 読み込めたら（`playbackStatusUpdate` の `isLoaded`）`seekTo(startMs / 1000)`（単語は 0）→ `play()`
- 1 文は、再生を始めてから `(endMs - startMs + 150) ms` でタイマーを置いて `pause()` する（`currentTime` の通知は 100ms 間隔なので、タイマーの方が区間の終わりに合う）
- 単語は `didJustFinish` で終わる
- 10 秒たっても読み込めなければ `playing` を `null` に戻す（読み上げと同じ）
- `stop()`：`pause()` とタイマーの解除。アンマウント・`AppState` が `active` でなくなったときにも呼ぶ
- 先読みはしない（mobile は押してから読む）

### 3. カードにボタン

- `PaperCardFront`・`PaperCardBack` に `pronunciation` の props を足し、語句のすぐ右に単語のボタン、1 文のすぐ下に 1 文のボタンを置く（位置は UI 設計）。ボタンは `PronunciationButtons.tsx` に分ける
- 1 文の再生中は `SentenceText` の強調の地を濃くする
- ボタンはカード（`Pressable`）の中の `Pressable` にする（子が押されると親の `onPress`〈めくる〉は呼ばれない）。スワイプの `PanResponder` はめくった後の横の動きだけを引き受けるので、ボタンのタップとは取り合わない
- `word_url` が null の単語のボタンは `disabled` にして `accessibilityLabel` に「準備中」。`sentence` が null の 1 文のボタンは出さない
- 読み上げのラベルは「{見出し語} の発音を聞く」「この文を聞く」、`accessibilityState={{ selected: 再生中 }}`
- カードの `Pressable` は読み上げでは 1 つのボタンのまま（中のボタンは読み上げの要素にならない）なので、`accessibilityActions` に「発音を聞く」（`word_url` があるとき）・「この文を聞く」（`sentence` があるとき）を足し、`onAccessibilityAction` で `toggle` を呼ぶ
- web 表示ではカードの `accessibilityRole` を外す（react-native-web が `<button>` にし、中のボタンと入れ子になるため）
- `FlashCard` の `flip`・`answer` で `stop()` を呼ぶ。`VocabularySession` が `usePronunciation` を 1 つ持って渡す

## 動作確認

```bash
pnpm --filter mobile lint
pnpm --filter mobile exec tsc --noEmit
pnpm --filter mobile exec expo export --platform ios
pnpm --filter mobile exec expo export --platform android
```

Expo web（port 8085、Dev Login。手順は apps/mobile/CLAUDE.md）で：

- [ ] 表と裏に単語のボタンが出る。押すとカードはめくれず、mp3 が再生される。もう一度押すと止まる
- [ ] 1 文のボタンで区間だけが再生される。めくる・答えると止まる
- [ ] 音声が無い見出し語・問題では「準備中」・ボタンなしになる

iOS シミュレーター（または実機）で（Expo web では確かめられないもの）：

- [ ] 消音モードで、発音は鳴り、めくる効果音は鳴らない。発音の後にめくっても、めくる音は消音モードで鳴らない
- [ ] 音楽を流したまま発音を押すと、音楽が一時的に小さくなって戻る（止まらない）。めくる音では音楽が変わらない
- [ ] 読み上げ（解答画面）を聞いた後に単語帳を開いても、めくる音が消音モードで鳴らない
- [ ] VoiceOver でカードを選び、上下スワイプで「発音を聞く」「この文を聞く」を選んでダブルタップすると鳴る。カードはめくれない
