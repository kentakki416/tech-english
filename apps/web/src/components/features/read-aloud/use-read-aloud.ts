"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { AttemptBlock, GetAttemptAudioResponse } from "@repo/api-schema"

import {
  buildReadAloudTimeline,
  calculateBlockPositionMs,
  calculateReadAloudProgress,
  findWordIndexAt,
  type ReadAloudTimeline,
  type TimelineBlock,
} from "@/features/read-aloud/read-aloud-timeline"

import { type ReadAloudRate, useReadAloudRate } from "./use-read-aloud-rate"

/**
 * 音声の情報の状態。loading は画面を開いてから取得が終わるまで、error は取得か再生の失敗（再生ボタンで取り直す）
 */
export type ReadAloudAvailability = "error" | "failed" | "loading" | "pending" | "ready"

export type ReadAloudMode = "all" | "block"

export type ReadAloudPlayback = {
  blockIndex: number
  isPlaying: boolean
  mode: ReadAloudMode
  partIndex: number
  /**
   * 読み上げ中の単語（パートの words の添字）。最初の単語より前は -1
   */
  wordIndex: number
}

/**
 * 読み上げ中の単語のハイライト（PassageReader に渡す）
 */
export type ReadAloudReading = {
  blockIndex: number
  segmentEnd: number
  segmentStart: number
}

type UseReadAloudOptions = {
  attemptId: number
  blocks: AttemptBlock[]
  /**
   * false の間は音声の情報を取得しない（解答画面は、hydration の後に作り直す前の描画で取得しないよう false にする）。既定は true
   */
  isEnabled?: boolean
  /**
   * 解答画面だけ渡す。ブロックの中の再生位置が 1 秒を超えたとき、ブロックごとに 1 回呼ぶ
   */
  onBlockListened?: (blockIndex: number) => void
}

type FetchedAudio =
  | { availability: "error" | "failed" | "pending", timeline: null }
  | { availability: "ready", timeline: ReadAloudTimeline }

/**
 * 再生中の位置。audio のイベントと requestAnimationFrame から読むので、React の state とは別に持つ
 */
type PlaybackCursor = {
  blockIndex: number
  mode: ReadAloudMode
  partIndex: number
}

type PlaybackUpdate = (current: ReadAloudPlayback | null) => ReadAloudPlayback | null

type PlayerEvents = {
  /**
   * 音声の読み込みの失敗など。再生は止めてから呼ぶ
   */
  onError: () => void
  onListened: (blockIndex: number) => void
  onPlaybackChange: (update: PlaybackUpdate) => void
}

type ReadAloudPlayer = ReturnType<typeof createReadAloudPlayer>

/**
 * この再生位置（ブロックの中のミリ秒）を超えたら「聞いた段落」に数える
 */
const LISTENED_THRESHOLD_MS = 1000

/**
 * 挑戦の音声のマニフェストを Route Handler から取り、時刻表にする。通信の失敗は throw（呼び出し側が error にする）。
 * レスポンスは Route Handler が api-schema で検証済みなので、ここでは型を付けるだけにする（Zod のスキーマを bundle に入れないため）
 */
const fetchAudio = async (attemptId: number, blocks: AttemptBlock[], signal: AbortSignal): Promise<FetchedAudio> => {
  const res = await fetch(`/api/attempts/${attemptId}/audio`, { signal })
  if (!res.ok) return { availability: "error", timeline: null }
  const audio = await res.json() as GetAttemptAudioResponse
  if (audio.status !== "ready") return { availability: audio.status, timeline: null }
  const timeline = buildReadAloudTimeline(blocks, audio)
  return timeline.blocks.length === 0 ? { availability: "failed", timeline: null } : { availability: "ready", timeline }
}

/**
 * HTMLAudioElement での再生（docs/spec/read-aloud/README.md「再生の実装」）。
 * audio を 1 つ使い回してパートごとに src を差し替え、再生中だけ requestAnimationFrame で読み上げ中の単語を追う。
 * React の state は events.onPlaybackChange で更新し、単語が変わったときだけ呼ぶ（画面全体を毎フレーム描き直さない）
 */
const createReadAloudPlayer = (events: PlayerEvents) => {
  let audio: HTMLAudioElement | null = null
  /**
   * 次のパートを先に読み込む（ブラウザのキャッシュに載せる）だけの audio。再生はしない
   */
  let preloadAudio: HTMLAudioElement | null = null
  let timeline: ReadAloudTimeline | null = null
  let cursor: PlaybackCursor | null = null
  let rate: ReadAloudRate = 1
  let wordIndex = -1
  let frameId: number | null = null
  /**
   * 「聞いた段落」として通知したブロック。親も重複を除くので、二重に通知しても害は無い
   */
  const listenedBlocks = new Set<number>()

  const findBlock = (blockIndex: number): TimelineBlock | undefined => timeline?.blocks.find(block => block.blockIndex === blockIndex)

  const findNextBlock = (blockIndex: number): TimelineBlock | undefined => timeline?.blocks.find(block => block.blockIndex > blockIndex)

  const stopTracking = () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    frameId = null
  }

  const trackWord = () => {
    frameId = null
    const block = cursor ? findBlock(cursor.blockIndex) : undefined
    const part = cursor ? block?.parts[cursor.partIndex] : undefined
    if (!audio || !cursor || !block || !part) return

    const { blockIndex, partIndex } = cursor
    const positionMs = audio.currentTime * 1000
    const nextWordIndex = findWordIndexAt(part.words, positionMs)
    if (nextWordIndex !== wordIndex) {
      wordIndex = nextWordIndex
      events.onPlaybackChange(current =>
        current && current.blockIndex === blockIndex && current.partIndex === partIndex ? { ...current, wordIndex: nextWordIndex } : current,
      )
    }
    if (!listenedBlocks.has(blockIndex) && calculateBlockPositionMs(block, partIndex, positionMs) >= LISTENED_THRESHOLD_MS) {
      listenedBlocks.add(blockIndex)
      events.onListened(blockIndex)
    }
    frameId = window.requestAnimationFrame(trackWord)
  }

  const startTracking = () => {
    if (frameId === null) frameId = window.requestAnimationFrame(trackWord)
  }

  /**
   * src を外して読み込みを止める（src="" は error イベントになるので使わない）
   */
  const unloadAudio = () => {
    if (!audio) return
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
  }

  const stop = () => {
    stopTracking()
    cursor = null
    wordIndex = -1
    preloadAudio = null
    unloadAudio()
    events.onPlaybackChange(() => null)
  }

  /**
   * 自動再生の制限などで再生できなかったら一時停止の扱いにする。src を差し替えたときの中断（AbortError）も届くが、
   * そのときは次の play が続いているので、止まったままのときだけ表示を合わせる
   */
  const playAudio = (element: HTMLAudioElement) => {
    element.play().catch(() => {
      if (element.paused && cursor !== null) events.onPlaybackChange(current => current && { ...current, isPlaying: false })
    })
  }

  /**
   * 再生中かは自分の操作ではなく audio の play / pause で決める（イヤホンが外れたなど、ブラウザが止めたときも表示を合わせる）
   */
  const handlePlay = () => {
    events.onPlaybackChange(current => current && { ...current, isPlaying: true })
    startTracking()
  }

  const handlePause = () => {
    /**
     * パートの終わりにも pause が届く。続きのパートに進むかは ended で決めるので、その間は再生中のまま見せる
     */
    if (audio?.ended) return
    stopTracking()
    events.onPlaybackChange(current => current && { ...current, isPlaying: false })
  }

  /**
   * 同じブロックの次のパート → 全文なら次のブロック → 終わり の順
   */
  const handleEnded = () => {
    stopTracking()
    if (!cursor) return
    const block = findBlock(cursor.blockIndex)
    if (block && cursor.partIndex + 1 < block.parts.length) {
      startPart(block.blockIndex, cursor.partIndex + 1, cursor.mode)
      return
    }
    const nextBlock = cursor.mode === "all" ? findNextBlock(cursor.blockIndex) : undefined
    if (nextBlock) {
      startPart(nextBlock.blockIndex, 0, "all")
      return
    }
    stop()
  }

  const handleError = () => {
    /**
     * 停止で src を外したときは再生していないので無視する
     */
    if (!cursor) return
    stop()
    events.onError()
  }

  const ensureAudio = (): HTMLAudioElement => {
    if (audio) return audio
    const element = new Audio()
    element.preservesPitch = true
    element.addEventListener("play", handlePlay)
    element.addEventListener("pause", handlePause)
    element.addEventListener("ended", handleEnded)
    element.addEventListener("error", handleError)
    audio = element
    return element
  }

  /**
   * 次のパート（同じブロックの次のパート、全文なら次のブロックの最初のパート）を先に読み込む。
   * 参照を持っておくのは、解放されると読み込みが止まることがあるため
   */
  const preloadNextPart = (blockIndex: number, partIndex: number, mode: ReadAloudMode) => {
    const nextPart = findBlock(blockIndex)?.parts[partIndex + 1] ?? (mode === "all" ? findNextBlock(blockIndex)?.parts[0] : undefined)
    if (!nextPart) {
      preloadAudio = null
      return
    }
    if (preloadAudio?.src === nextPart.url) return
    const element = new Audio()
    element.preload = "auto"
    element.src = nextPart.url
    preloadAudio = element
  }

  const startPart = (blockIndex: number, partIndex: number, mode: ReadAloudMode) => {
    const part = findBlock(blockIndex)?.parts[partIndex]
    if (!part) return
    const element = ensureAudio()
    stopTracking()
    cursor = { blockIndex, mode, partIndex }
    wordIndex = -1
    events.onPlaybackChange(current => ({ blockIndex, isPlaying: current?.isPlaying ?? false, mode, partIndex, wordIndex: -1 }))
    element.src = part.url
    /**
     * src を差し替えると playbackRate が defaultPlaybackRate に戻るので、差し替えた後に設定する
     */
    element.defaultPlaybackRate = rate
    element.playbackRate = rate
    playAudio(element)
    preloadNextPart(blockIndex, partIndex, mode)
  }

  return {
    /**
     * 画面を離れる（アンマウントする）ときに呼ぶ。React の state は更新しない
     */
    dispose: () => {
      stopTracking()
      cursor = null
      preloadAudio = null
      unloadAudio()
    },
    getCursor: (): PlaybackCursor | null => cursor,
    pause: () => {
      if (cursor) audio?.pause()
    },
    setRate: (next: ReadAloudRate) => {
      rate = next
      if (!audio) return
      audio.defaultPlaybackRate = next
      audio.playbackRate = next
    },
    /**
     * blockIndex のブロックの最初から読む。全文は最後のブロックまで、段落はそのブロックだけ
     */
    start: (input: { blockIndex: number, mode: ReadAloudMode, rate: ReadAloudRate, timeline: ReadAloudTimeline }) => {
      timeline = input.timeline
      rate = input.rate
      startPart(input.blockIndex, 0, input.mode)
    },
    stop,
    /**
     * 再生中なら一時停止、一時停止中なら続きから
     */
    toggle: () => {
      if (!audio || !cursor) return
      if (audio.paused) playAudio(audio)
      else audio.pause()
    },
  }
}

/**
 * 読み上げ（解答画面と結果画面で共有する）。音声の取得・再生・単語の追跡・聞いた段落の通知をまとめる。
 * 返す関数はすべて参照が変わらない（PassageReader の memo したブロックに渡せる）
 */
export function useReadAloud({ attemptId, blocks, isEnabled = true, onBlockListened }: UseReadAloudOptions): {
  availability: ReadAloudAvailability
  /**
   * 待機中は null
   */
  playback: ReadAloudPlayback | null
  progress: number
  rate: ReadAloudRate
  /**
   * 読み上げ中の単語のハイライト（PassageReader に渡す）。単語が無いとき null
   */
  reading: ReadAloudReading | null
  pause: () => void
  playBlock: (blockIndex: number) => void
  setRate: (rate: ReadAloudRate) => void
  stop: () => void
  togglePlay: () => void
} {
  const [availability, setAvailability] = useState<ReadAloudAvailability>("loading")
  const [timeline, setTimeline] = useState<ReadAloudTimeline | null>(null)
  const [playback, setPlayback] = useState<ReadAloudPlayback | null>(null)
  /**
   * 増やすと音声の情報を取り直す（取得の失敗の後に再生ボタンを押したとき）
   */
  const [fetchCount, setFetchCount] = useState(0)
  const [rate, saveRate] = useReadAloudRate()

  /**
   * 操作の関数の参照を変えないよう、最新の値を ref にも持つ（イベントハンドラーからだけ読む）
   */
  const availabilityRef = useRef<ReadAloudAvailability>("loading")
  const timelineRef = useRef<ReadAloudTimeline | null>(null)
  const rateRef = useRef(rate)
  const onBlockListenedRef = useRef(onBlockListened)
  /**
   * 初めて再生するときに作る
   */
  const playerRef = useRef<ReadAloudPlayer | null>(null)

  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  useEffect(() => {
    onBlockListenedRef.current = onBlockListened
  }, [onBlockListened])

  const updateAvailability = useCallback((next: ReadAloudAvailability) => {
    availabilityRef.current = next
    setAvailability(next)
  }, [])

  /**
   * 画面を開いた後に取得する（挑戦の取得のレスポンスを重くしない。押す前に「準備中」を出すため、押したときではなく開いたときに取る）。
   * 画面を離れた後に届いた結果は捨てる
   */
  useEffect(() => {
    if (!isEnabled) return
    const controller = new AbortController()
    fetchAudio(attemptId, blocks, controller.signal)
      .then((fetched) => {
        if (controller.signal.aborted) return
        timelineRef.current = fetched.timeline
        setTimeline(fetched.timeline)
        updateAvailability(fetched.availability)
      })
      .catch(() => {
        if (!controller.signal.aborted) updateAvailability("error")
      })
    return () => controller.abort()
  }, [attemptId, blocks, fetchCount, isEnabled, updateAvailability])

  const getPlayer = useCallback((): ReadAloudPlayer => {
    playerRef.current ??= createReadAloudPlayer({
      onError: () => updateAvailability("error"),
      onListened: blockIndex => onBlockListenedRef.current?.(blockIndex),
      onPlaybackChange: setPlayback,
    })
    return playerRef.current
  }, [updateAvailability])

  const startPlayback = useCallback((currentTimeline: ReadAloudTimeline, blockIndex: number, mode: ReadAloudMode) => {
    getPlayer().start({ blockIndex, mode, rate: rateRef.current, timeline: currentTimeline })
  }, [getPlayer])

  const togglePlay = useCallback(() => {
    const currentTimeline = timelineRef.current
    const firstBlock = currentTimeline?.blocks[0]
    if (availabilityRef.current === "error") {
      if (currentTimeline && firstBlock) {
        updateAvailability("ready")
        startPlayback(currentTimeline, firstBlock.blockIndex, "all")
      } else {
        updateAvailability("loading")
        setFetchCount(count => count + 1)
      }
      return
    }
    if (availabilityRef.current !== "ready" || !currentTimeline || !firstBlock) return
    const player = getPlayer()
    if (player.getCursor() === null) startPlayback(currentTimeline, firstBlock.blockIndex, "all")
    else player.toggle()
  }, [getPlayer, startPlayback, updateAvailability])

  const playBlock = useCallback((blockIndex: number) => {
    const currentTimeline = timelineRef.current
    if (availabilityRef.current !== "ready" || !currentTimeline) return
    if (!currentTimeline.blocks.some(block => block.blockIndex === blockIndex)) return
    const player = getPlayer()
    const cursor = player.getCursor()
    if (cursor?.blockIndex === blockIndex && cursor.mode === "block") player.toggle()
    else startPlayback(currentTimeline, blockIndex, "block")
  }, [getPlayer, startPlayback])

  const pause = useCallback(() => {
    playerRef.current?.pause()
  }, [])

  const stop = useCallback(() => {
    playerRef.current?.stop()
    setPlayback(null)
  }, [])

  const setRate = useCallback((next: ReadAloudRate) => {
    saveRate(next)
    playerRef.current?.setRate(next)
  }, [saveRate])

  /**
   * 画面を離れたとき（タブの切り替え）は一時停止する。タイマーが止まるのと合わせる
   */
  useEffect(() => {
    const pauseOnHidden = () => {
      if (document.visibilityState === "hidden") playerRef.current?.pause()
    }
    document.addEventListener("visibilitychange", pauseOnHidden)
    return () => document.removeEventListener("visibilitychange", pauseOnHidden)
  }, [])

  useEffect(() => () => {
    playerRef.current?.dispose()
    playerRef.current = null
  }, [])

  const part = playback && timeline ? timeline.blocks.find(block => block.blockIndex === playback.blockIndex)?.parts[playback.partIndex] : undefined
  const word = playback && playback.wordIndex >= 0 ? part?.words[playback.wordIndex] : undefined
  const reading: ReadAloudReading | null = playback && word
    ? { blockIndex: playback.blockIndex, segmentEnd: word.segmentEnd, segmentStart: word.segmentStart }
    : null
  /**
   * 単語の単位で進める（ミニプレーヤーが幅の変化を補間する）
   */
  const progress = playback && timeline
    ? calculateReadAloudProgress(timeline, { blockIndex: playback.blockIndex, mode: playback.mode, partIndex: playback.partIndex, positionMs: word?.startMs ?? 0 })
    : 0

  return { availability, pause, playback, playBlock, progress, rate, reading, setRate, stop, togglePlay }
}
