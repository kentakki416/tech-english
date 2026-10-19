import { type AudioMode, setAudioModeAsync } from "expo-audio"

/**
 * 鳴らすものごとの音声のモード（vocabulary-pronunciation README「再生の実装」）
 */
const AUDIO_MODES = {
  /**
   * 効果音（単語帳のめくる音・解答画面の選択肢の音）。消音モードでは鳴らさず、ほかのアプリの音楽と混ぜる（iOS の ambient）
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
 * 音声のモードを 1 か所で切り替える。効果音・発音・読み上げはそれぞれ違うモードで鳴らすので、鳴らす側は必ずこれを通す
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
