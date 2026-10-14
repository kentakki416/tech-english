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
 * 音声のモードを 1 か所で切り替える。めくる効果音・発音・読み上げはそれぞれ違うモードで鳴らすので、鳴らす側は必ずこれを通す
 * （それぞれが setAudioModeAsync を呼ぶと、後から呼んだ方のモードが残って取り違える。発音を聞いた後のめくる音が消音モードでも鳴る、など）。
 *
 * 鳴らす前に呼び、返る Promise を待ってから play する（setAudioModeAsync は後から効くので、待たないと前のモードで鳴る）。
 * 読み上げだけは待たない（パートの mp3 を読み込む間に設定が終わる。use-read-aloud.ts）。
 * 失敗しても再生は続ける（warn だけ）。web 表示では setAudioModeAsync が何もしない
 */
export const requestAudioMode = async (kind: AudioModeKind): Promise<void> => {
  if (current?.kind === kind) return current.ready
  /**
   * 失敗したら覚えたモードを捨てる（次に同じモードを頼んだときに設定し直す）
   */
  const ready = setAudioModeAsync(AUDIO_MODES[kind]).catch((error: unknown) => {
    console.warn("Failed to set audio mode:", error)
    if (current?.ready === ready) current = null
  })
  current = { kind, ready }
  return ready
}
```

- `use-flip-sound.ts`：マウント時の `setAudioModeAsync` を `requestAudioMode("effect")` にし（最初のめくりで設定を待たないように先に頼む）、`play` でも `requestAudioMode("effect")` を待ってから鳴らす（発音・読み上げの後にモードを戻す）
- `use-read-aloud.ts`：`requestAudioMode`（初めて再生するときに 1 回）の中の `setAudioModeAsync` を `requestAudioMode("readAloud")` にし、再生を始める・再開するたびに呼ぶ（同じモードなら何もしない）。待たない（パートの mp3 を読み込む間に設定が終わる）
- web 表示では `setAudioModeAsync` が何もしないので、そのままでよい

### 2. `usePronunciation`

`src/features/vocabulary/use-pronunciation.ts`。`expo-audio` の `useAudioPlayer` を 1 つ使い回す。

- `toggle(target, source)`：同じものを再生中なら止める。違えば `requestAudioMode("pronunciation")` を待ち、`player.replace({ uri })` → 読み込めたら（`playbackStatusUpdate` を受けたときの `player.isLoaded`。`status.isLoaded` は web では常に true）`seekTo(startMs / 1000)`（始めが 0 なら seek しない）→ `play()`
- 止めるのはタイマー。`play()` の後、`playbackStatusUpdate`（`updateInterval: 100`）で `player.playing` になり、再生位置が `startMs` より進んだ（鳴り始めた）ときの `player.currentTime` から、終わりまでの時間で置く。終わりは 1 文は `endMs`（次の単語の始まりで文の後の間を含むので余白は足さない）、単語は `player.duration` + 150ms（鳴り終わってから表示を戻す。長さが分からなければ 3 秒後）。`play()` の時点から数えると、seek した先の読み込みが遅いときに文の最後が切れる。web の expo-audio は `play()` の時点で `player.playing` を true にするので、再生位置が進んだかでも確かめる（読み上げと同じ）。通知の位置で判定するより、タイマーの方が区間の終わりに合う
- `seekTo(startMs / 1000, 0, 0)`（iOS は許容誤差を省くと前後にずれた位置へ seek する）
- `didJustFinish` は前の再生のものが遅れて届くことがあるので使わない
- 10 秒たっても読み込めなければ `playing` を `null` に戻す（読み上げと同じ）
- `stop()`：`pause()` とタイマーの解除。アンマウント・`AppState` が `active` でなくなったときにも呼ぶ。再生中かに関わらず `pause()` する
- expo-audio は、アプリが背面に移ったとき・一時的に音声を取られたときに止めた player を、前面に戻ったときに鳴らし直す。止めた後（再生していないとき）に `status.playing` の通知が来たら `pause()` し直す（止めたのに段落の続きが鳴り続けないように）
- 先読みはしない（mobile は押してから読む）

### 3. カードにボタン

- `PaperCardFront`・`PaperCardBack` に `pronunciation` の props を足し、語句のすぐ右に単語のボタン、1 文のすぐ下に 1 文のボタンを置く（位置は UI 設計）。ボタンは `PronunciationButtons.tsx` に分ける
- 1 文の再生中は `SentenceText` の強調の地を濃くする
- 1 文のボタンの文字は再生中も「この文を聞く」のまま（再生中は琥珀の地〈縁なし〉・動く波・`accessibilityState.selected`）。単語のボタンの再生中だけ細い縁を付ける
- ボタンはカード（`Pressable`）の中の `Pressable` にする（子が押されると親の `onPress`〈めくる〉は呼ばれない）。スワイプの `PanResponder` はめくった後の横の動きだけを引き受けるので、ボタンのタップとは取り合わない
- `word_url` が null の単語のボタンは `onPress` を外して押せなくし、`accessibilityLabel` に「準備中」・`accessibilityState` に `disabled`。`Pressable` の `disabled` は使わない（disabled の `Pressable` はタッチを引き受けず、外のカードがめくれてしまう）。`sentence` が null の 1 文のボタンは出さない
- 読み上げのラベルは「{見出し語} の発音を聞く」「この文を聞く」、`accessibilityState={{ selected: 再生中 }}`
- カードの `Pressable` は読み上げでは 1 つのボタンのまま（中のボタンは読み上げの要素にならない）なので、`accessibilityActions` に「発音を聞く」（`word_url` があるとき）・「この文を聞く」（`sentence` があるとき）を足し、`onAccessibilityAction` で `toggle` を呼ぶ
- web 表示ではカードの `accessibilityRole` を外す（react-native-web が `<button>` にし、中のボタンと入れ子になるため）
- `FlashCard` の `flip`・`answer` で `stop()` を呼ぶ。答えて飛んでいく間は鳴らさない。`VocabularySession` が `usePronunciation` を 1 つ持って渡す

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
- [ ] VoiceOver でカードを選び、上下スワイプで「発音を聞く」「この文を聞く」を選んでダブルタップすると鳴る（新アーキテクチャの iOS はアクションの `name` を読むので、`name` も日本語にしてある）。カードはめくれない

Android エミュレーター（または実機）で：

- [ ] 1 文が区間の始めから鳴り、区間の終わりで止まる
- [ ] TalkBack でカードのアクションに「発音を聞く」「この文を聞く」が出る。カードの中の発音のボタンも別の要素として辿れるなら、ボタンでも鳴らせるので許容する（仕様の書き方を直す）
