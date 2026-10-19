# step1-web-choice-sound

web の解答画面で、選択肢を選んだときにポキンを鳴らす。単語帳のめくる音のモジュール（`src/libs/paper-sound.ts`）を効果音全体のモジュールにし、オン / オフを解答画面と共有する。仕様と理由は [README](../README.md)。

## 対応内容

### 変えるファイル

| ファイル | 内容 |
| --- | --- |
| `apps/web/src/libs/choice-pop.ts`（新規） | `buildChoicePopSamples(sampleRate, pitchRatio)`：ポキンのサンプルの列を作る純関数 |
| `apps/web/src/libs/sound-effects.ts`（`paper-sound.ts` を移す） | 設定のストア・`AudioContext`・めくる音（今のまま）・ポキン・`useSoundEffects` |
| `apps/web/src/components/ui/SoundEffectToggle.tsx`（新規） | スピーカーのボタン（単語帳の上部バーのボタンを部品にする） |
| `apps/web/src/components/features/vocabulary/VocabularySession.tsx` | `usePaperSound` → `useSoundEffects`、ボタンを `SoundEffectToggle` に |
| `apps/web/src/components/features/attempt/SolvingScreen.tsx` | `chooseAnswer` で鳴らす、上部バーに `SoundEffectToggle` |
| `apps/web/scripts/write-choice-pop-wav.ts`（新規）・`apps/web/package.json` | mobile の WAV を書き出すスクリプトと `sound:choice-pop`、devDependencies に `tsx` |

`app/mock/_components/paper-sound.ts`（デザインモック）は変えない。

### `src/libs/choice-pop.ts`

```ts
const POP_START_HZ = 1100
const POP_END_HZ = 520
const POP_SWEEP_SECONDS = 0.045
const POP_PEAK_GAIN = 0.16
const POP_END_SECONDS = 0.1

const RING_HZ = 2080
const RING_START_SECONDS = 0.01
const RING_PEAK_GAIN = 0.05
const RING_END_SECONDS = 0.16

const ATTACK_SECONDS = 0.004
const SILENT_GAIN = 0.0001

export const CHOICE_POP_SECONDS = RING_END_SECONDS

const rampExponentially = (from: number, to: number, progress: number): number =>
  from * (to / from) ** Math.min(Math.max(progress, 0), 1)

const calculateEnvelope = (elapsed: number, peakGain: number, endSeconds: number): number => {
  if (elapsed < 0 || elapsed >= endSeconds) return 0
  if (elapsed < ATTACK_SECONDS) return SILENT_GAIN + (peakGain - SILENT_GAIN) * (elapsed / ATTACK_SECONDS)
  return rampExponentially(peakGain, SILENT_GAIN, (elapsed - ATTACK_SECONDS) / (endSeconds - ATTACK_SECONDS))
}

export const buildChoicePopSamples = (sampleRate: number, pitchRatio: number): Float32Array => {
  const samples = new Float32Array(Math.ceil(sampleRate * CHOICE_POP_SECONDS))
  let popPhase = 0
  let ringPhase = 0
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate
    const popHz = rampExponentially(POP_START_HZ, POP_END_HZ, time / POP_SWEEP_SECONDS) * pitchRatio
    popPhase += (2 * Math.PI * popHz) / sampleRate
    const pop = Math.sin(popPhase) * calculateEnvelope(time, POP_PEAK_GAIN, POP_END_SECONDS)
    const ringElapsed = time - RING_START_SECONDS
    if (ringElapsed >= 0) ringPhase += (2 * Math.PI * RING_HZ * pitchRatio) / sampleRate
    const ring = Math.sin(ringPhase) * calculateEnvelope(ringElapsed, RING_PEAK_GAIN, RING_END_SECONDS - RING_START_SECONDS)
    samples[index] = pop + ring
  }
  return samples
}
```

- 値は README の「音の作り」の表と同じにする。実装のときに聞いて値を変えたら、README の表も直す
- `import` を持たない（スクリプトから Node で読むため。`"use client"` も付けない）

### `src/libs/sound-effects.ts`

`paper-sound.ts` を `git mv` で移し、次を変える。

```ts
const SOUND_EFFECT_STORAGE_KEY = "tech-english:vocabulary-sound"

const PITCH_JITTER = 0.03

const playChoicePop = (context: AudioContext) => {
  const pitchRatio = 1 - PITCH_JITTER + Math.random() * PITCH_JITTER * 2
  const samples = buildChoicePopSamples(context.sampleRate, pitchRatio)
  const buffer = context.createBuffer(1, samples.length, context.sampleRate)
  buffer.copyToChannel(samples, 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
}

export function useSoundEffects() {
  const isEnabled = useSyncExternalStore(subscribe, readIsEnabled, () => true)

  const playWith = useCallback((render: (context: AudioContext) => void) => {
    if (!isEnabled) return
    const context = getAudioContext()
    if (!context) return
    try {
      if (context.state === "suspended") context.resume().catch(() => undefined)
      render(context)
    } catch {
      return
    }
  }, [isEnabled])

  const playChoice = useCallback(() => playWith(playChoicePop), [playWith])

  const playFlip = useCallback(() => playWith(playSwish), [playWith])

  const toggle = useCallback(() => {
    const next = !isEnabled
    try {
      window.localStorage.setItem(SOUND_EFFECT_STORAGE_KEY, next ? "on" : "off")
      fallbackIsEnabled = null
    } catch {
      fallbackIsEnabled = next
    }
    for (const listener of listeners) listener()
  }, [isEnabled])

  return { isEnabled, playChoice, playFlip, toggle }
}
```

- `SOUND_STORAGE_KEY` は `SOUND_EFFECT_STORAGE_KEY` に改め、キーの値は変えない（理由は README の「オン / オフの持ち方」。コードのコメントにも 1 行で書く）
- `subscribe` / `readIsEnabled` / `getAudioContext` / `playSwish` は今のまま。`useCallback` と `buildChoicePopSamples` の import を足す

### `src/components/ui/SoundEffectToggle.tsx`

```tsx
"use client"

type SoundEffectToggleProps = {
  className?: string
  isEnabled: boolean
  showsLabel: boolean
  onToggle: () => void
}

export function SoundEffectToggle({ className = "", isEnabled, showsLabel, onToggle }: SoundEffectToggleProps) {
  return (
    <button
      aria-label="効果音"
      aria-pressed={isEnabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-raised hover:text-fg ${className}`}
      title={isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
      type="button"
      onClick={onToggle}
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {isEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
      </svg>
      {showsLabel && <span aria-hidden className="hidden sm:inline">効果音</span>}
    </button>
  )
}
```

- 単語帳の上部バーのボタン（今の `VocabularySession.tsx` のマークアップ）をそのまま部品にする。単語帳は `showsLabel`、解答画面は `showsLabel={false}`
- 解答画面では、上部バーのほかのボタンと同じフォーカスの輪（`HEADER_BUTTON_FOCUS_CLASS`）を `className` で渡す

### `SolvingScreen.tsx`

```tsx
const sound = useSoundEffects()
const { playChoice } = sound
const isReadAloudPlaying = readAloud.playback?.isPlaying ?? false

const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
  if (answers[questionId] !== choiceIndex && !isReadAloudPlaying) playChoice()
  setAnswers(current => ({ ...current, [questionId]: choiceIndex }))
}, [answers, isReadAloudPlaying, playChoice])
```

- クリック（`QuestionPanel` / `QuestionSheet` の `onChoose`）とキーボード（`useAttemptShortcuts` の `onChoose`）はどちらも `chooseAnswer` を通るので、ほかは変えない
- `playChoice` は `useCallback` で、オン / オフが変わるまで同じ関数を返す（`chooseAnswer` を描画のたびに作り直さないように）
- 上部バーの「全文訳」の左に `<SoundEffectToggle className={HEADER_BUTTON_FOCUS_CLASS} isEnabled={sound.isEnabled} showsLabel={false} onToggle={sound.toggle} />` を置く

### `scripts/write-choice-pop-wav.ts`

```ts
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildChoicePopSamples } from "../src/libs/choice-pop"

const SAMPLE_RATE = 44100
const OUTPUT_PATH = resolve(import.meta.dirname, "../../mobile/assets/sounds/choice-pop.wav")

const encodeWav = (samples: Float32Array, sampleRate: number): Buffer => {
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)
  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), 44 + index * 2)
  })
  return buffer
}

writeFileSync(OUTPUT_PATH, encodeWav(buildChoicePopSamples(SAMPLE_RATE, 1), SAMPLE_RATE))
```

- `package.json` の scripts に `"sound:choice-pop": "tsx scripts/write-choice-pop-wav.ts"`、devDependencies に `tsx`
- 書き出した WAV は step2 で使う（この step で書き出してコミットしてよい）

## 動作確認

web にはテストの仕組みが無いので、型と lint と画面で確かめる。

```bash
pnpm --filter web exec tsc --noEmit
pnpm lint:fix
pnpm --filter web sound:choice-pop
```

`verify-web-page` skill で解答画面（`/attempts/...`）と単語帳の 1 回分を開いて確かめる。

- [ ] 選択肢をクリックすると鳴る。キーボードの `1`〜`4` でも鳴る
- [ ] 別の選択肢に選び直すと鳴り、選んでいる選択肢をもう一度押すと鳴らない
- [ ] 読み上げの再生中に選ぶと鳴らず、一時停止中に選ぶと鳴る
- [ ] 上部バーのスピーカーでオフにすると鳴らなくなり、単語帳を開くとめくる音もオフになっている（逆も同じ）
- [ ] 上部バーにスピーカーのアイコンが「全文訳」の左に出る（スマホ幅・PC 幅）。単語帳の上部バーの見た目は変わらない
- [ ] console error が 0 件
- [ ] `choice-pop.wav` が 0.16 秒・44.1kHz・16bit・モノラルで書き出される（`afinfo` などで確かめる）
- [ ] 音を聞いて、強すぎ・長すぎ・始まりの「ブツッ」が無いかを人が確かめる（値を変えたら README の表を直す）
