"use client"

import { useSyncExternalStore } from "react"

/**
 * 効果音のオン / オフを覚えておく localStorage のキー（"off" のときだけ消す）
 */
const SOUND_STORAGE_KEY = "tech-english:vocabulary-sound"

/**
 * 「シュッ」の長さ。めくる動き（animate-card-flip の 440ms）の前半で鳴り終わる短さにする
 */
const SWISH_SECONDS = 0.14

/**
 * 音量の山（控えめにする）と、そこまでの時間（短すぎると始まりがブツッと鳴る）
 */
const SWISH_PEAK_GAIN = 0.12
const SWISH_ATTACK_SECONDS = 0.025

const listeners = new Set<() => void>()

/**
 * localStorage に書けなかったときの値（プライベートブラウズなど）。書けないときも、開いている間は切り替えた値で動かす
 */
let fallbackIsEnabled: boolean | null = null

/**
 * 画面をまたいで 1 つだけ使う AudioContext（1 回分を開き直すたびに作ると、閉じない context が増えるため）
 */
let sharedContext: AudioContext | null = null

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/**
 * localStorage が使えない（プライベートブラウズなど）ときは、切り替えた値か、まだ切り替えていなければオン
 */
const readIsEnabled = (): boolean => {
  if (fallbackIsEnabled !== null) return fallbackIsEnabled
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

/**
 * 最初に鳴らすとき（ユーザーの操作の中）に作る（自動再生の制限のため）。AudioContext が無い・作れないブラウザでは null（鳴らさない）
 */
const getAudioContext = (): AudioContext | null => {
  if (sharedContext) return sharedContext
  if (typeof window.AudioContext !== "function") return null
  try {
    sharedContext = new AudioContext()
  } catch {
    return null
  }
  return sharedContext
}

/**
 * 紙をめくる「シュッ」を 1 回鳴らす（vocabulary-cards README「効果音」）。
 * ノイズの低い成分を落とし、中高音の帯域を上へ動かして軽く抜ける音にする。鳴らすたびに高さを ±5% 変える
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
 * カードをめくる効果音。音声ファイルを持たず、Web Audio でノイズから作る。オン / オフは localStorage に覚える。
 * 鳴らせなくても（AudioContext が無い・失敗した）めくる操作は止めない
 */
export function usePaperSound() {
  const isEnabled = useSyncExternalStore(subscribe, readIsEnabled, () => true)

  const play = () => {
    if (!isEnabled) return
    const context = getAudioContext()
    if (!context) return
    try {
      if (context.state === "suspended") context.resume().catch(() => undefined)
      playSwish(context)
    } catch {
      /**
       * 効果音は飾りなので、鳴らせなくても何もしない
       */
    }
  }

  const toggle = () => {
    const next = !isEnabled
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off")
      fallbackIsEnabled = null
    } catch {
      fallbackIsEnabled = next
    }
    for (const listener of listeners) listener()
  }

  return { isEnabled, play, toggle }
}
