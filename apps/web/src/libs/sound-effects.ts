"use client"

import { useCallback, useSyncExternalStore } from "react"

import { buildChoicePopSamples } from "./choice-pop"

/**
 * 効果音のオン / オフを覚えておく localStorage のキー（"off" のときだけ消す）。単語帳と解答画面で共通。
 * 単語帳だけにあったときの名前のまま。変えると、単語帳でオフにしている人の設定が消えるため
 */
const SOUND_EFFECT_STORAGE_KEY = "tech-english:vocabulary-sound"

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
 * ポキンの高さを鳴らすたびに変える幅（±3%。同じ音が続いて機械的に聞こえないように）
 */
const CHOICE_POP_PITCH_JITTER = 0.03

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
    return window.localStorage.getItem(SOUND_EFFECT_STORAGE_KEY) !== "off"
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
 * 選択肢を選んだときの「ポキン」を 1 回鳴らす（choice-sound README「音の作り」）
 */
const playChoicePop = (context: AudioContext) => {
  const pitchRatio = 1 - CHOICE_POP_PITCH_JITTER + Math.random() * CHOICE_POP_PITCH_JITTER * 2
  const samples = buildChoicePopSamples(context.sampleRate, pitchRatio)
  const buffer = context.createBuffer(1, samples.length, context.sampleRate)
  buffer.copyToChannel(samples, 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
}

/**
 * 効果音（単語帳のめくる音・解答画面のポキン）。音声ファイルを持たず、Web Audio で作る。オン / オフは 1 つの設定を localStorage に覚え、
 * 開いている画面と別のタブにすぐ効く。鳴らせなくても（AudioContext が無い・失敗した）呼び出し元の操作は止めない。
 * 返す関数は、オン / オフが変わるまで同じ参照
 */
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
      /**
       * 効果音は飾りなので、鳴らせなくても何もしない
       */
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
