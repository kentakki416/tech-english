"use client"

import { useRef, useState } from "react"

/**
 * 「シュッ」の長さ。めくる動き（animate-card-flip の 440ms）の前半で鳴り終わる短さにする
 */
const SWISH_SECONDS = 0.14

/**
 * 音量の山（控えめにする）と、そこまでの時間（短すぎると始まりがブツッと鳴る）
 */
const SWISH_PEAK_GAIN = 0.12
const SWISH_ATTACK_SECONDS = 0.025

/**
 * 紙をめくる「シュッ」を 1 回鳴らす。ノイズの低い成分を落とし、中高音の帯域を上へ動かして軽く抜ける音にする
 */
const playSwish = (context: AudioContext) => {
  const now = context.currentTime
  const length = Math.ceil(context.sampleRate * SWISH_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1

  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = 0.95 + Math.random() * 0.1

  const highpass = context.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 1400

  const band = context.createBiquadFilter()
  band.type = "bandpass"
  band.Q.value = 1.1
  band.frequency.setValueAtTime(2800, now)
  band.frequency.exponentialRampToValueAtTime(5600, now + SWISH_SECONDS)

  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(SWISH_PEAK_GAIN, now + SWISH_ATTACK_SECONDS)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + SWISH_SECONDS)

  source.connect(highpass).connect(band).connect(gain).connect(context.destination)
  source.start(now)
  source.stop(now + SWISH_SECONDS)
}

/**
 * 紙をめくる効果音（モック）。音声ファイルを持たず、Web Audio でノイズから短い「シュッ」を作る。
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
    playSwish(context)
  }

  return { isEnabled, play, toggle: () => setIsEnabled(value => !value) }
}
