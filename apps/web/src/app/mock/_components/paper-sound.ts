"use client"

import { useRef, useState } from "react"

/**
 * 紙をめくる音の長さ（めくる動き animate-card-flip の 440ms に収める）
 */
const RUSTLE_SECONDS = 0.34

/**
 * 紙の繊維がこすれる「パチパチ」の数。毎回位置を変えて、同じ音の繰り返しに聞こえないようにする
 */
const CRACKLE_COUNT = 16

/**
 * ページが落ちて止まる「パタッ」の時刻（カードが真横を向いて、面を差し替える頃）
 */
const FLAP_AT_SECONDS = 0.22

type NoiseBurst = {
  duration: number
  endFrequency: number
  filterType: BiquadFilterType
  gain: number
  startAt: number
  startFrequency: number
}

/**
 * 紙がこすれる音の素。ホワイトノイズに、
 * ① 60ms で立ち上がって消えていく包絡（めくり始めて離れていく）と、
 * ② ランダムな位置の鋭い山（紙の繊維がこすれるパチパチ）を掛ける
 */
const createRustleBuffer = (context: AudioContext): AudioBuffer => {
  const length = Math.ceil(context.sampleRate * RUSTLE_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  const crackles = Array.from({ length: CRACKLE_COUNT }, () => ({
    at: 0.01 + Math.random() * 0.26,
    strength: 0.5 + Math.random() * 1.6,
  }))
  for (let index = 0; index < length; index += 1) {
    const time = index / context.sampleRate
    const swell = time < 0.06 ? time / 0.06 : Math.exp(-(time - 0.06) * 8)
    const crackle = crackles.reduce((sum, item) => (time >= item.at ? sum + item.strength * Math.exp(-(time - item.at) * 260) : sum), 0)
    data[index] = (Math.random() * 2 - 1) * swell * (0.35 + crackle)
  }
  /**
   * パチパチが重なると振幅が 1 を超えて音が割れるので、最大 0.9 にそろえる
   */
  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  if (peak > 0) for (let index = 0; index < length; index += 1) data[index] = (data[index] / peak) * 0.9
  return buffer
}

/**
 * ホワイトノイズを 1 回鳴らす。帯域を startFrequency から endFrequency へ動かし、音量はすぐに立ち上げてから消す
 */
const playNoiseBurst = (context: AudioContext, destination: AudioNode, burst: NoiseBurst) => {
  const length = Math.ceil(context.sampleRate * burst.duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = burst.filterType
  filter.frequency.setValueAtTime(burst.startFrequency, burst.startAt)
  filter.frequency.exponentialRampToValueAtTime(burst.endFrequency, burst.startAt + burst.duration)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, burst.startAt)
  gain.gain.exponentialRampToValueAtTime(burst.gain, burst.startAt + burst.duration * 0.25)
  gain.gain.exponentialRampToValueAtTime(0.0001, burst.startAt + burst.duration)
  source.connect(filter).connect(gain).connect(destination)
  source.start(burst.startAt)
  source.stop(burst.startAt + burst.duration)
}

/**
 * 紙を 1 枚めくる音を、3 つの音を重ねて作る
 *
 * - 紙のこすれ：パチパチを含むノイズを中高音（3.4kHz → 1.6kHz、めくれて離れるほど下げる）に絞る
 * - めくる風：低めのノイズ（900Hz → 450Hz）を短く
 * - ページが落ちる「パタッ」：ごく低いノイズ（420Hz → 180Hz）を一瞬
 */
const playPageTurn = (context: AudioContext) => {
  const now = context.currentTime
  const master = context.createGain()
  master.gain.value = 0.8
  master.connect(context.destination)

  const rustle = context.createBufferSource()
  rustle.buffer = createRustleBuffer(context)
  rustle.playbackRate.value = 0.92 + Math.random() * 0.16
  const highpass = context.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 600
  const band = context.createBiquadFilter()
  band.type = "bandpass"
  band.Q.value = 0.6
  band.frequency.setValueAtTime(3400, now)
  band.frequency.exponentialRampToValueAtTime(1600, now + RUSTLE_SECONDS)
  const rustleGain = context.createGain()
  rustleGain.gain.value = 0.9
  rustle.connect(highpass).connect(band).connect(rustleGain).connect(master)
  rustle.start(now)

  playNoiseBurst(context, master, { duration: 0.26, endFrequency: 450, filterType: "lowpass", gain: 0.16, startAt: now + 0.02, startFrequency: 900 })
  playNoiseBurst(context, master, { duration: 0.06, endFrequency: 180, filterType: "lowpass", gain: 0.24, startAt: now + FLAP_AT_SECONDS, startFrequency: 420 })
}

/**
 * 紙をめくる効果音（モック）。音声ファイルを持たず、Web Audio でノイズから作る。
 * AudioContext は最初にめくったとき（ユーザーの操作の中）に作る（自動再生の制限のため）
 */
export function usePaperSound() {
  const [isEnabled, setIsEnabled] = useState(true)
  const contextRef = useRef<AudioContext | null>(null)

  const play = () => {
    if (!isEnabled) return
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    if (context.state === "suspended") void context.resume()
    playPageTurn(context)
  }

  return { isEnabled, play, toggle: () => setIsEnabled(value => !value) }
}
