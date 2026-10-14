"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 再生中のもの。word は単語の発音、sentence は 1 文
 */
export type PronunciationTarget = "sentence" | "word"

/**
 * 鳴らす mp3。1 文は段落の音声のうちの区間（startMs〜endMs）だけを鳴らし、単語は最初から最後まで鳴らす
 */
export type PronunciationSource = { endMs?: number, startMs?: number, url: string }

export type Pronunciation = {
  playing: PronunciationTarget | null
  /**
   * 単語の mp3 を先に読んでおく（カードが出たとき）
   */
  preload: (url: string) => void
  stop: () => void
  /**
   * 同じものを再生中なら止める。別のものを再生中なら止めてから鳴らす
   */
  toggle: (target: PronunciationTarget, source: PronunciationSource) => void
}

/**
 * 今の再生。token は再生ごとに作り、前の再生の後始末（play() の失敗・ended）が次の再生を止めないようにする
 */
type ActivePlayback = {
  audio: HTMLAudioElement
  cleanup: () => void
  source: PronunciationSource
  target: PronunciationTarget
  token: symbol
}

/**
 * 1 文の区間の終わりに足す余白（区間の終わりは次の単語の始まりなので、最後の音が切れないように）
 */
const SENTENCE_TAIL_MS = 150

const createAudio = (url?: string): HTMLAudioElement => {
  const audio = new Audio()
  audio.preload = "auto"
  if (url) audio.src = url
  return audio
}

/**
 * src を外して読み込みを止める（src="" は error イベントになるので使わない）
 */
const unloadAudio = (audio: HTMLAudioElement) => {
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
}

/**
 * カードの発音の再生（vocabulary-pronunciation README「再生の実装」）。1 回分の画面で 1 つだけ持つ。
 * 1 文は段落の mp3 を鳴らす HTMLAudioElement を 1 つ使い回し、区間の始めに合わせて再生して、requestAnimationFrame で終わりを過ぎたら止める。
 * 単語は preload で URL ごとに作っておいた Audio を鳴らす（1 回分は最大 10 語なので数に上限は置かない）。
 *
 * Safari は利用者の操作の中で play() を呼ばないと鳴らさないので、読み込みを待たずに play() を呼び、
 * 始める位置は play() の前に currentTime に入れておく（読み込み前に入れた値は再生の開始位置になる）
 */
export function usePronunciation(): Pronunciation {
  const [playing, setPlaying] = useState<PronunciationTarget | null>(null)
  const activeRef = useRef<ActivePlayback | null>(null)
  const sentenceAudioRef = useRef<HTMLAudioElement | null>(null)
  const wordAudiosRef = useRef(new Map<string, HTMLAudioElement>())

  const stop = useCallback(() => {
    const active = activeRef.current
    activeRef.current = null
    if (active) {
      active.cleanup()
      active.audio.pause()
    }
    setPlaying(null)
  }, [])

  const preload = useCallback((url: string) => {
    if (!wordAudiosRef.current.has(url)) wordAudiosRef.current.set(url, createAudio(url))
  }, [])

  const toggle = useCallback((target: PronunciationTarget, source: PronunciationSource) => {
    /**
     * 同じ段落の mp3 を別のカードの 1 文で鳴らすこともあるので、URL に加えて始めの位置でも比べる
     */
    const current = activeRef.current
    const isSame = current?.target === target && current.source.url === source.url && current.source.startMs === source.startMs
    stop()
    if (isSame) return

    let audio: HTMLAudioElement
    if (target === "word") {
      preload(source.url)
      audio = wordAudiosRef.current.get(source.url) ?? createAudio(source.url)
    } else {
      sentenceAudioRef.current ??= createAudio()
      audio = sentenceAudioRef.current
      if (audio.getAttribute("src") !== source.url) audio.src = source.url
    }
    /**
     * 読み込みに失敗した audio は play() しても読み込み直さないので、押すたびに読み込み直す（回線が戻った後に鳴るように）
     */
    if (audio.error !== null) audio.load()

    const token = Symbol(target)
    const startSeconds = (source.startMs ?? 0) / 1000
    const stopAtMs = source.endMs === undefined ? null : source.endMs + SENTENCE_TAIL_MS
    let frameId: number | null = null

    const finish = () => {
      if (activeRef.current?.token === token) stop()
    }
    const trackEnd = () => {
      frameId = null
      if (stopAtMs !== null && !audio.seeking && audio.currentTime * 1000 >= stopAtMs) {
        finish()
        return
      }
      frameId = window.requestAnimationFrame(trackEnd)
    }
    /**
     * 読み込み前に入れた開始位置を使わないブラウザのために、読み込めたら合わせ直す
     */
    const seekToStart = () => {
      if (Math.abs(audio.currentTime - startSeconds) > 0.05) audio.currentTime = startSeconds
    }
    const cleanup = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      audio.removeEventListener("ended", finish)
      audio.removeEventListener("error", finish)
      audio.removeEventListener("pause", finish)
      audio.removeEventListener("loadedmetadata", seekToStart)
    }

    audio.addEventListener("ended", finish)
    audio.addEventListener("error", finish)
    /**
     * イヤホンが外れた・メディアキーなど、ブラウザや OS が止めたときも表示を戻す（自分で止めるときは cleanup の後に pause するので届かない）
     */
    audio.addEventListener("pause", finish)
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) audio.addEventListener("loadedmetadata", seekToStart, { once: true })
    activeRef.current = { audio, cleanup, source, target, token }
    setPlaying(target)

    audio.currentTime = startSeconds
    /**
     * 自動再生の制限・読み込めない mp3 は、押す前の状態に戻すだけにする（止めた・切り替えたときの中断も届くが、token が違うので何もしない）
     */
    audio.play()
      .then(() => {
        if (stopAtMs !== null && activeRef.current?.token === token) frameId = window.requestAnimationFrame(trackEnd)
      })
      .catch(finish)
  }, [preload, stop])

  /**
   * タブを隠したら止める。画面を離れたら止めて、読んでおいた mp3 を手放す
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    const wordAudios = wordAudiosRef.current
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stop()
      for (const audio of wordAudios.values()) unloadAudio(audio)
      wordAudios.clear()
      if (sentenceAudioRef.current) unloadAudio(sentenceAudioRef.current)
    }
  }, [stop])

  return { playing, preload, stop, toggle }
}
