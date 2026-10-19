/**
 * 選択肢を選んだときの「ポキン」（choice-sound README「音の作り」）。
 * 値を変えたら README の表を直し、`pnpm --filter web sound:choice-pop` で mobile の WAV も書き出し直してコミットする
 */
const POP_START_HZ = 1760
const POP_END_HZ = 830
const POP_SWEEP_SECONDS = 0.045
const POP_PEAK_GAIN = 0.16
const POP_END_SECONDS = 0.1

const RING_HZ = 3320
const RING_START_SECONDS = 0.01
const RING_PEAK_GAIN = 0.05
const RING_END_SECONDS = 0.16

/**
 * 0 から一気に上げると始まりが「ブツッ」と鳴るので、この時間をかけて上げる
 */
const ATTACK_SECONDS = 0.004

/**
 * 指数のランプは 0 を扱えないので、無音の代わりにこの値から上げ下げする（Web Audio の exponentialRampToValueAtTime と同じ）
 */
const SILENT_GAIN = 0.0001

export const CHOICE_POP_SECONDS = RING_END_SECONDS

/**
 * Web Audio の exponentialRampToValueAtTime と同じ式。progress は 0〜1 に収める
 */
const rampExponentially = (from: number, to: number, progress: number): number =>
  from * (to / from) ** Math.min(Math.max(progress, 0), 1)

/**
 * 鳴り始めからの経過で音量を返す。ATTACK_SECONDS で peakGain まで上げ、endSeconds で無音まで指数で下げる
 */
const calculateEnvelope = (elapsed: number, peakGain: number, endSeconds: number): number => {
  if (elapsed < 0 || elapsed >= endSeconds) return 0
  if (elapsed < ATTACK_SECONDS) return SILENT_GAIN + (peakGain - SILENT_GAIN) * (elapsed / ATTACK_SECONDS)
  return rampExponentially(peakGain, SILENT_GAIN, (elapsed - ATTACK_SECONDS) / (endSeconds - ATTACK_SECONDS))
}

/**
 * ポキンのサンプルの列（-1〜1）。高さを下げる「ポ」と、少し遅れて始まる高い「キン」を足す。pitchRatio はすべての高さに掛ける倍率。
 *
 * Web Audio のノードで組まずにサンプルを計算するのは、mobile の WAV を Node のスクリプト（scripts/write-choice-pop-wav.ts）で同じ関数から書き出すため
 */
export const buildChoicePopSamples = (sampleRate: number, pitchRatio: number): Float32Array<ArrayBuffer> => {
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
