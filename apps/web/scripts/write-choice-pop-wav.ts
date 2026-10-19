import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildChoicePopSamples } from "../src/libs/choice-pop"

/**
 * mobile の効果音。web と同じ関数から、高さの揺らぎを付けずに書き出す（pnpm --filter web sound:choice-pop）
 */
const SAMPLE_RATE = 44100

const OUTPUT_PATH = resolve(import.meta.dirname, "../../mobile/assets/sounds/choice-pop.wav")

const PCM_MAX = 0x7fff

/**
 * 16bit・モノラルの PCM の WAV にする（-1〜1 を外れたサンプルは切り詰める）
 */
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
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * PCM_MAX), 44 + index * 2)
  })
  return buffer
}

writeFileSync(OUTPUT_PATH, encodeWav(buildChoicePopSamples(SAMPLE_RATE, 1), SAMPLE_RATE))
