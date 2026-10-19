# step2-mobile-choice-sound

mobile の解答画面で、選択肢を選んだときにポキンを鳴らす。単語帳のめくる音のフック（`src/features/vocabulary/use-flip-sound.ts`）を効果音全体のフックにし、オン / オフを解答画面と共有する。読み上げの再開は音声のモードを待ってから鳴らす。仕様と理由は [README](../README.md)。step1 の後に行う（WAV は step1 のスクリプトで書き出す）。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/mobile/assets/sounds/choice-pop.wav`（新規） | `pnpm --filter web sound:choice-pop` で書き出した音（step1 でコミット済みならそのまま） |
| `apps/mobile/src/features/sound-effect/sound-effect-setting.ts`（新規） | オン / オフをモジュールに 1 つ持つストア |
| `apps/mobile/src/features/sound-effect/use-sound-effects.ts`（`use-flip-sound.ts` を移す） | めくる音とポキンのプレイヤー、`useSoundEffects` |
| `apps/mobile/src/components/ui/SoundEffectToggle.tsx`（新規） | スピーカーのボタン（単語帳の上部バーのボタンを部品にする） |
| `apps/mobile/src/components/features/vocabulary/VocabularySession.tsx` | `useFlipSound` → `useSoundEffects`、ボタンを `SoundEffectToggle` に |
| `apps/mobile/src/components/features/attempt/SolvingScreen.tsx`・`SolvingTopBar.tsx` | `chooseAnswer` で鳴らす、上部バーに `SoundEffectToggle` |
| `apps/mobile/src/features/read-aloud/use-read-aloud.ts` | 再開（`toggle`）で `requestAudioMode("readAloud")` を待ってから `play` |
| `docs/spec/vocabulary-cards/README.md` | 効果音の実装の表の `use-flip-sound.ts` を `use-sound-effects.ts` に |

`src/components/mock/use-flip-sound.ts`（デザインモック）は変えない。

### `src/features/sound-effect/sound-effect-setting.ts`

```ts
import AsyncStorage from "@react-native-async-storage/async-storage"

const SOUND_EFFECT_STORAGE_KEY = "tech-english:vocabulary-sound"

const listeners = new Set<() => void>()

let isEnabled = true

let loading: Promise<void> | null = null

const notify = () => {
  for (const listener of listeners) listener()
}

const loadSetting = () => {
  loading ??= AsyncStorage.getItem(SOUND_EFFECT_STORAGE_KEY)
    .then((stored) => {
      if (stored === "off") {
        isEnabled = false
        notify()
      }
    })
    .catch((error: unknown) => console.warn("Failed to read sound effect setting:", error))
}

export const subscribeSoundEffectSetting = (listener: () => void) => {
  loadSetting()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const readSoundEffectSetting = (): boolean => isEnabled

export const toggleSoundEffectSetting = () => {
  isEnabled = !isEnabled
  notify()
  void AsyncStorage.setItem(SOUND_EFFECT_STORAGE_KEY, isEnabled ? "on" : "off")
    .catch((error: unknown) => console.warn("Failed to save sound effect setting:", error))
}
```

- キーの値は変えない（理由は README の「オン / オフの持ち方」。コードのコメントにも 1 行で書く）
- アカウント削除の `AsyncStorage.clear()` で消えたあとは、モジュールの値が残る。アプリを開き直すとオンに戻る（今の `useFlipSound` と同じ）

### `src/features/sound-effect/use-sound-effects.ts`

```ts
import { useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useSyncExternalStore } from "react"

import { requestAudioMode } from "@/libs/audio-mode"

import { readSoundEffectSetting, subscribeSoundEffectSetting, toggleSoundEffectSetting } from "./sound-effect-setting"

const FLIP_SOUND = require("../../../assets/sounds/page-flip.wav")

const CHOICE_SOUND = require("../../../assets/sounds/choice-pop.wav")

export function useSoundEffects() {
  const flipPlayer = useAudioPlayer(FLIP_SOUND)
  const choicePlayer = useAudioPlayer(CHOICE_SOUND)
  const isEnabled = useSyncExternalStore(subscribeSoundEffectSetting, readSoundEffectSetting)

  useEffect(() => {
    void requestAudioMode("effect")
  }, [])

  const playFlip = useCallback(() => {
    if (!isEnabled) return
    void requestAudioMode("effect").then(() => {
      void flipPlayer.seekTo(0)
      flipPlayer.play()
    })
  }, [flipPlayer, isEnabled])

  const playChoice = useCallback(() => {
    if (!isEnabled) return
    void requestAudioMode("effect").then(() => {
      void choicePlayer.seekTo(0)
      choicePlayer.play()
    })
  }, [choicePlayer, isEnabled])

  return { isEnabled, playChoice, playFlip, toggle: toggleSoundEffectSetting }
}
```

- 画面を開いたときに `requestAudioMode("effect")` を頼むのは今の `useFlipSound` と同じ（最初の 1 回で設定を待たないように）。解答画面でも、読み上げは再生を始めるたびに自分のモードを頼むので困らない
- 今の `useFlipSound` のコメント（ambient にする理由など）は、このフックに移す

### `src/components/ui/SoundEffectToggle.tsx`

```tsx
import { Ionicons } from "@expo/vector-icons"
import { Pressable } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

export function SoundEffectToggle({ isEnabled, onToggle }: { isEnabled: boolean, onToggle: () => void }) {
  return (
    <Pressable
      accessibilityLabel={isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onToggle}
    >
      <Ionicons color={THEME_COLORS.fgMuted} name={isEnabled ? "volume-high-outline" : "volume-mute-outline"} size={20} />
    </Pressable>
  )
}
```

- 解答画面の上部バーでは、ほかのボタン（`styles.iconButton`）と高さを揃えるため `style` を受け取れるようにしてよい

### `SolvingScreen.tsx`・`SolvingTopBar.tsx`

```tsx
const sound = useSoundEffects()
const { playChoice } = sound
const isReadAloudPlaying = readAloud.playback?.isPlaying ?? false

const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
  if (answers[questionId] !== choiceIndex && !isReadAloudPlaying) playChoice()
  setAnswers(current => ({ ...current, [questionId]: choiceIndex }))
}, [answers, isReadAloudPlaying, playChoice])
```

- `SolvingTopBar` に `isSoundEnabled` と `onToggleSound` を足し、「全文訳」の左に `<SoundEffectToggle isEnabled={isSoundEnabled} onToggle={onToggleSound} />` を置く。コンポーネントの説明（「‹ 中断」・残り時間・全文訳・一時停止）に効果音を足す

### `use-read-aloud.ts`（再開）

```ts
isStarting = true
updateIsPlaying(true)
void requestAudioMode("readAloud").then(() => {
  if (isPauseRequested || !cursor) return
  player.play()
})
```

- `toggle` の再開の分岐だけを変える。`start`（最初から読む）は今のまま待たない（パートの mp3 を読み込む間に設定が終わるため）
- 待っている間に一時停止（`pause` が `isPauseRequested` を立てる）か停止（`stop` が `cursor` を消す）が押されたら鳴らさない
- `toggle` の上のコメント（設定を待たない理由）を、再開は待つ理由（効果音でモードが変わっていることがある）に直す

## 動作確認

mobile にはテストの仕組みが無いので、型と lint と画面で確かめる。

```bash
pnpm --filter mobile exec tsc --noEmit
pnpm lint:fix
```

iOS シミュレーター（無ければ `npx expo start --web --port 8085`。web 表示では音声のモードの確認はできない）で、解答画面と単語帳の 1 回分を開いて確かめる。

- [ ] 選択肢をタップすると鳴る。別の選択肢に選び直すと鳴り、選んでいる選択肢をもう一度押すと鳴らない
- [ ] 読み上げの再生中に選ぶと鳴らず、一時停止中に選ぶと鳴る
- [ ] 上部バーのスピーカーでオフにすると鳴らなくなり、単語帳を開くとめくる音もオフになっている（逆も同じ。アプリを開き直しても残る）
- [ ] 上部バーにスピーカーのアイコンが「全文訳」の左に出て、幅の狭い端末（iPhone SE）でも上部バーの要素が重ならない
- [ ] **iOS の実機**で、消音モードのまま「読み上げ → 一時停止 → 選択肢を選ぶ → 再開」で読み上げが鳴る。消音モードでは効果音が鳴らない。ほかのアプリの音楽を流したまま選んでも音楽が止まらない
