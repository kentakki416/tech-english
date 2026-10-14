"use client"

import { useRef, useState } from "react"

/**
 * card は 1 枚を裏返す短い音（デザイン 1）、page はリングを軸にめくる音とページが落ちる音（デザイン 2）
 */
export type PaperSoundKind = "card" | "page"

type NoiseBurst = {
  duration: number
  endFrequency: number
  filterType: BiquadFilterType
  gain: number
  startAt: number
  startFrequency: number
}

/**
 * ホワイトノイズの音源。紙の擦れる音は、ノイズの帯域と音量の変化で作る
 */
const createNoiseBuffer = (context: AudioContext, seconds: number): AudioBuffer => {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  return buffer
}

/**
 * ノイズを 1 回鳴らす。帯域を startFrequency から endFrequency へ動かし、音量はすぐに立ち上げてから消す
 */
const playNoiseBurst = (context: AudioContext, burst: NoiseBurst) => {
  const source = context.createBufferSource()
  source.buffer = createNoiseBuffer(context, burst.duration)
  const filter = context.createBiquadFilter()
  filter.type = burst.filterType
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(burst.startFrequency, burst.startAt)
  filter.frequency.exponentialRampToValueAtTime(burst.endFrequency, burst.startAt + burst.duration * 0.7)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, burst.startAt)
  gain.gain.exponentialRampToValueAtTime(burst.gain, burst.startAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, burst.startAt + burst.duration)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(burst.startAt)
  source.stop(burst.startAt + burst.duration)
}

/**
 * 紙をめくる効果音（モック）。音声ファイルを持たず、Web Audio でノイズから作る。
 * AudioContext は最初にめくったとき（ユーザーの操作の中）に作る（自動再生の制限のため）
 */
export function usePaperSound() {
  const [isEnabled, setIsEnabled] = useState(true)
  const contextRef = useRef<AudioContext | null>(null)

  const play = (kind: PaperSoundKind) => {
    if (!isEnabled) return
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    if (context.state === "suspended") void context.resume()
    const now = context.currentTime
    if (kind === "card") {
      playNoiseBurst(context, { duration: 0.15, endFrequency: 5600, filterType: "bandpass", gain: 0.3, startAt: now, startFrequency: 2400 })
      return
    }
    playNoiseBurst(context, { duration: 0.36, endFrequency: 4200, filterType: "bandpass", gain: 0.28, startAt: now, startFrequency: 900 })
    playNoiseBurst(context, { duration: 0.08, endFrequency: 380, filterType: "lowpass", gain: 0.32, startAt: now + 0.55, startFrequency: 1100 })
  }

  return { isEnabled, play, toggle: () => setIsEnabled(value => !value) }
}
