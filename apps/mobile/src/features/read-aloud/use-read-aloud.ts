import { useIsFocused } from "@react-navigation/native"
import { useEventListener } from "expo"
import { type AudioPlayer, type AudioStatus, type PitchCorrectionQuality, setAudioModeAsync, useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Platform } from "react-native"

import type { AttemptBlock } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"

import {
  DEFAULT_READ_ALOUD_RATE,
  findNextReadAloudRate,
  type ReadAloudRate,
  readReadAloudRate,
  writeReadAloudRate,
} from "./read-aloud-rate"
import {
  buildReadAloudTimeline,
  calculateBlockPositionMs,
  calculateReadAloudProgress,
  findWordIndexAt,
  type ReadAloudTimeline,
  type TimelineBlock,
} from "./read-aloud-timeline"

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
   * 解答画面だけ渡す。ブロックの中の再生位置が 1 秒を超えたとき、ブロックごとに 1 回呼ぶ
   */
  onBlockListened?: (blockIndex: number) => void
}

type FetchedAudio =
  | { availability: "error" | "failed" | "pending", timeline: null }
  | { availability: "ready", timeline: ReadAloudTimeline }

/**
 * 再生中の位置。player の playbackStatusUpdate から読むので、React の state とは別に持つ
 */
type PlaybackCursor = {
  blockIndex: number
  mode: ReadAloudMode
  partIndex: number
}

type PlaybackUpdate = (current: ReadAloudPlayback | null) => ReadAloudPlayback | null

type ControllerEvents = {
  /**
   * 音声の読み込みの失敗。再生は止めてから呼ぶ
   */
  onError: () => void
  onListened: (blockIndex: number) => void
  onPlaybackChange: (update: PlaybackUpdate) => void
}

type ReadAloudController = ReturnType<typeof createReadAloudController>

/**
 * この再生位置（ブロックの中のミリ秒）を超えたら「聞いた段落」に数える
 */
const LISTENED_THRESHOLD_MS = 1000

/**
 * playbackStatusUpdate の間隔
 */
const STATUS_UPDATE_INTERVAL_MS = 100

/**
 * replace してからこの時間たっても読み込めていなければ、読み込みの失敗として止める（AudioStatus にはエラーが無いため）
 */
const LOAD_TIMEOUT_MS = 10_000

/**
 * replace の直後に届いた更新のうち、再生位置がこれ以上のものは前のパートのものとして捨てる
 * （ネイティブからの更新は非同期に届くので、replace より前に送られた更新が後から届くことがある）
 */
const STALE_STATUS_MIN_MS = 1000

/**
 * 速度を変えても声の高さを保つ。iOS は medium（timeDomain。声に向く）。
 * web の expo-audio は high のときだけ preservesPitch を true にするので、web 表示だけ high にする（Android は品質の指定を使わない）
 */
const PITCH_CORRECTION_QUALITY: PitchCorrectionQuality = Platform.OS === "web" ? "high" : "medium"

/**
 * 挑戦の音声のマニフェストを取り、時刻表にする。通信・検証の失敗は throw（呼び出し側が error にする）
 */
const fetchAudio = async (attemptId: number, blocks: AttemptBlock[]): Promise<FetchedAudio> => {
  const audio = await attemptApi.getAudio(attemptId)
  if (audio.status !== "ready") return { availability: audio.status, timeline: null }
  const timeline = buildReadAloudTimeline(blocks, audio)
  return timeline.blocks.length === 0 ? { availability: "failed", timeline: null } : { availability: "ready", timeline }
}

/**
 * expo-audio の player での再生（docs/spec/read-aloud/README.md「再生の実装」）。
 * player を 1 つ使い回してパートごとに replace し、playbackStatusUpdate（100ms ごと）で読み上げ中の単語を追う。
 * React の state は events.onPlaybackChange で更新し、単語が変わったときだけ呼ぶ（画面全体を 100ms ごとに描き直さない）。
 * 次のパートの先読みはしない（段落の間に短い間が空くのは許容する）
 */
const createReadAloudController = (player: AudioPlayer, events: ControllerEvents) => {
  let timeline: ReadAloudTimeline | null = null
  let cursor: PlaybackCursor | null = null
  let rate: ReadAloudRate = DEFAULT_READ_ALOUD_RATE
  let wordIndex = -1
  /**
   * 表示している「再生中」（events.onPlaybackChange に渡した isPlaying）
   */
  let isPlaying = false
  /**
   * play() を呼んでから鳴り始める（status.playing が true で再生位置が進む）まで。
   * その間の playing: false（読み込み中・パートの切り替え）では表示を一時停止にしない
   */
  let isStarting = false
  /**
   * replace の後、このパートの更新がまだ届いていない
   */
  let isAwaitingPartStatus = false
  /**
   * このパートで status.playing を見たか。再生を始める前に届いた didJustFinish は前のパートのものとして無視する
   */
  let hasPlayedPart = false
  /**
   * このパートの didJustFinish を処理したか（web・Android は終わりの更新が 2 回届くことがある）
   */
  let hasFinishedPart = false
  let loadTimer: ReturnType<typeof setTimeout> | null = null
  let isAudioModeRequested = false
  /**
   * 「聞いた段落」として通知したブロック。親も重複を除くので、二重に通知しても害は無い
   */
  const listenedBlocks = new Set<number>()

  const findBlock = (blockIndex: number): TimelineBlock | undefined => timeline?.blocks.find(block => block.blockIndex === blockIndex)

  const findNextBlock = (blockIndex: number): TimelineBlock | undefined => timeline?.blocks.find(block => block.blockIndex > blockIndex)

  const updateIsPlaying = (next: boolean) => {
    if (isPlaying === next) return
    isPlaying = next
    events.onPlaybackChange(current => current && { ...current, isPlaying: next })
  }

  const clearLoadTimer = () => {
    if (loadTimer !== null) clearTimeout(loadTimer)
    loadTimer = null
  }

  const stop = () => {
    clearLoadTimer()
    cursor = null
    wordIndex = -1
    isPlaying = false
    isStarting = false
    player.pause()
    events.onPlaybackChange(() => null)
  }

  /**
   * 消音モードでも鳴らし、ほかのアプリの音楽は止める。初めて再生するときに 1 回だけ（画面を開いただけではほかのアプリの音を止めない）。
   * 失敗しても再生は続ける
   */
  const requestAudioMode = () => {
    if (isAudioModeRequested) return
    isAudioModeRequested = true
    void setAudioModeAsync({ interruptionMode: "doNotMix", playsInSilentMode: true, shouldPlayInBackground: false })
      .catch((error: unknown) => console.warn("Failed to set audio mode:", error))
  }

  /**
   * パートを最初から再生する。読み込みに失敗しても AudioStatus にはエラーが無いので、10 秒たっても読み込めていなければ止める
   */
  const startPart = (blockIndex: number, partIndex: number, mode: ReadAloudMode) => {
    const part = findBlock(blockIndex)?.parts[partIndex]
    if (!part) return
    cursor = { blockIndex, mode, partIndex }
    wordIndex = -1
    isPlaying = true
    isStarting = true
    isAwaitingPartStatus = true
    hasPlayedPart = false
    hasFinishedPart = false
    events.onPlaybackChange(() => ({ blockIndex, isPlaying: true, mode, partIndex, wordIndex: -1 }))
    player.replace({ uri: part.url })
    /**
     * replace の後は速度が戻ることがあるので、パートごとに設定し直す
     */
    player.shouldCorrectPitch = true
    player.setPlaybackRate(rate, PITCH_CORRECTION_QUALITY)
    player.play()
    clearLoadTimer()
    loadTimer = setTimeout(() => {
      loadTimer = null
      if (player.isLoaded) return
      stop()
      events.onError()
    }, LOAD_TIMEOUT_MS)
  }

  /**
   * 同じブロックの次のパート → 全文なら次のブロック → 終わり の順
   */
  const startNextPart = (current: PlaybackCursor) => {
    const block = findBlock(current.blockIndex)
    if (block && current.partIndex + 1 < block.parts.length) {
      startPart(block.blockIndex, current.partIndex + 1, current.mode)
      return
    }
    const nextBlock = current.mode === "all" ? findNextBlock(current.blockIndex) : undefined
    if (nextBlock) {
      startPart(nextBlock.blockIndex, 0, "all")
      return
    }
    stop()
  }

  /**
   * 読み上げ中の単語と聞いた段落。単語が変わったときだけ state を変える
   */
  const trackPosition = (block: TimelineBlock, current: PlaybackCursor, positionMs: number) => {
    const { blockIndex, partIndex } = current
    const words = block.parts[partIndex]?.words ?? []
    const nextWordIndex = findWordIndexAt(words, positionMs)
    if (nextWordIndex !== wordIndex) {
      wordIndex = nextWordIndex
      events.onPlaybackChange(playback =>
        playback && playback.blockIndex === blockIndex && playback.partIndex === partIndex ? { ...playback, wordIndex: nextWordIndex } : playback,
      )
    }
    if (!listenedBlocks.has(blockIndex) && calculateBlockPositionMs(block, partIndex, positionMs) >= LISTENED_THRESHOLD_MS) {
      listenedBlocks.add(blockIndex)
      events.onListened(blockIndex)
    }
  }

  const pause = () => {
    if (!cursor) return
    player.pause()
    isStarting = false
    updateIsPlaying(false)
  }

  /**
   * playbackStatusUpdate。単語の追跡・聞いた段落・パートの終わり・再生中の表示を status に合わせる
   * （電話・ほかのアプリの音声で OS が止めたときも、status.playing で表示を一時停止にする）
   */
  const handleStatus = (status: AudioStatus) => {
    if (!cursor) return
    const block = findBlock(cursor.blockIndex)
    if (!block) return
    /**
     * status.isLoaded は web では常に true なので、player の今の値で確かめる
     */
    if (loadTimer !== null && player.isLoaded) clearLoadTimer()

    const positionMs = status.currentTime * 1000
    if (isAwaitingPartStatus) {
      if (positionMs >= STALE_STATUS_MIN_MS) return
      isAwaitingPartStatus = false
    }
    if (status.didJustFinish) {
      if (hasPlayedPart && !hasFinishedPart) {
        hasFinishedPart = true
        startNextPart(cursor)
      }
      return
    }

    trackPosition(block, cursor, positionMs)
    if (status.playing) {
      hasPlayedPart = true
      /**
       * web の expo-audio は play イベントで、まだ鳴っていなくても playing: true を送る（続く loadeddata では false）。
       * 再生位置が進んでから鳴り始めたとみなす
       */
      if (positionMs > 0) isStarting = false
      updateIsPlaying(true)
    } else if (!isStarting) {
      updateIsPlaying(false)
    }
  }

  return {
    /**
     * 画面を離れる（アンマウントする）ときに呼ぶ。React の state は更新しない
     */
    dispose: () => {
      clearLoadTimer()
      cursor = null
      try {
        player.pause()
      } catch {
        /**
         * useAudioPlayer が先に player を解放していたら何もしない（解放で再生も止まる）
         */
      }
    },
    getCursor: (): PlaybackCursor | null => cursor,
    handleStatus,
    pause,
    setRate: (next: ReadAloudRate) => {
      rate = next
      if (cursor) player.setPlaybackRate(next, PITCH_CORRECTION_QUALITY)
    },
    /**
     * blockIndex のブロックの最初から読む。全文は最後のブロックまで、段落はそのブロックだけ
     */
    start: (input: { blockIndex: number, mode: ReadAloudMode, rate: ReadAloudRate, timeline: ReadAloudTimeline }) => {
      timeline = input.timeline
      rate = input.rate
      requestAudioMode()
      startPart(input.blockIndex, 0, input.mode)
    },
    stop,
    /**
     * 再生中なら一時停止、一時停止中なら続きから
     */
    toggle: () => {
      if (!cursor) return
      if (isPlaying) {
        pause()
        return
      }
      isStarting = true
      updateIsPlaying(true)
      player.play()
    },
  }
}

/**
 * 読み上げ（解答画面と結果画面で共有する）。音声の取得・再生・単語の追跡・聞いた段落の通知をまとめる。
 * 返す値・操作は web の同名の hook と同じ（速度は setRate の代わりに cycleRate）。返す関数はすべて参照が変わらない
 *
 * - 再生は expo-audio（docs/spec/read-aloud/README.md「再生の実装」）。web 表示では HTML の audio で動く
 * - アプリが前面でなくなったら一時停止する（タイマーが止まるのと合わせる）
 * - 画面の上に別の画面を積んだときも一時停止する（結果画面の「もう一度解く」「次の問題を解く」は push なので、結果画面が残って鳴り続けるため）
 */
export function useReadAloud({ attemptId, blocks, onBlockListened }: UseReadAloudOptions): {
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
  /**
   * 押すたびに 0.75 → 1 → 1.25 → 0.75。保存して、再生中なら速度も変える（再生は止めない）
   */
  cycleRate: () => void
  pause: () => void
  playBlock: (blockIndex: number) => void
  stop: () => void
  togglePlay: () => void
} {
  const player = useAudioPlayer(null, { updateInterval: STATUS_UPDATE_INTERVAL_MS })
  const isFocused = useIsFocused()
  const [availability, setAvailability] = useState<ReadAloudAvailability>("loading")
  const [timeline, setTimeline] = useState<ReadAloudTimeline | null>(null)
  const [playback, setPlayback] = useState<ReadAloudPlayback | null>(null)
  /**
   * 増やすと音声の情報を取り直す（取得の失敗の後に再生ボタンを押したとき）
   */
  const [fetchCount, setFetchCount] = useState(0)
  /**
   * 保存した速度を読み終えるまでは 1 倍
   */
  const [rate, setRate] = useState<ReadAloudRate>(DEFAULT_READ_ALOUD_RATE)

  /**
   * 操作の関数の参照を変えないよう、最新の値を ref にも持つ（イベントハンドラーからだけ読む）
   */
  const availabilityRef = useRef<ReadAloudAvailability>("loading")
  const timelineRef = useRef<ReadAloudTimeline | null>(null)
  const rateRef = useRef<ReadAloudRate>(DEFAULT_READ_ALOUD_RATE)
  /**
   * 保存した速度を読み終える前に速度を変えたら、後から届いた保存の値で上書きしない
   */
  const hasChosenRateRef = useRef(false)
  const onBlockListenedRef = useRef(onBlockListened)
  /**
   * 初めて再生するときに作る
   */
  const controllerRef = useRef<ReadAloudController | null>(null)

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
    let isActive = true
    const load = async () => {
      try {
        const fetched = await fetchAudio(attemptId, blocks)
        if (!isActive) return
        timelineRef.current = fetched.timeline
        setTimeline(fetched.timeline)
        updateAvailability(fetched.availability)
      } catch {
        if (isActive) updateAvailability("error")
      }
    }
    void load()
    return () => {
      isActive = false
    }
  }, [attemptId, blocks, fetchCount, updateAvailability])

  useEffect(() => {
    let isActive = true
    void readReadAloudRate().then((stored) => {
      if (!isActive || hasChosenRateRef.current) return
      rateRef.current = stored
      setRate(stored)
      controllerRef.current?.setRate(stored)
    })
    return () => {
      isActive = false
    }
  }, [])

  const getController = useCallback((): ReadAloudController => {
    controllerRef.current ??= createReadAloudController(player, {
      onError: () => updateAvailability("error"),
      onListened: blockIndex => onBlockListenedRef.current?.(blockIndex),
      onPlaybackChange: setPlayback,
    })
    return controllerRef.current
  }, [player, updateAvailability])

  useEventListener(player, "playbackStatusUpdate", (status) => {
    controllerRef.current?.handleStatus(status)
  })

  const startPlayback = useCallback((currentTimeline: ReadAloudTimeline, blockIndex: number, mode: ReadAloudMode) => {
    getController().start({ blockIndex, mode, rate: rateRef.current, timeline: currentTimeline })
  }, [getController])

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
    const controller = getController()
    if (controller.getCursor() === null) startPlayback(currentTimeline, firstBlock.blockIndex, "all")
    else controller.toggle()
  }, [getController, startPlayback, updateAvailability])

  const playBlock = useCallback((blockIndex: number) => {
    const currentTimeline = timelineRef.current
    if (availabilityRef.current !== "ready" || !currentTimeline) return
    if (!currentTimeline.blocks.some(block => block.blockIndex === blockIndex)) return
    const controller = getController()
    const cursor = controller.getCursor()
    if (cursor?.blockIndex === blockIndex && cursor.mode === "block") controller.toggle()
    else startPlayback(currentTimeline, blockIndex, "block")
  }, [getController, startPlayback])

  const pause = useCallback(() => {
    controllerRef.current?.pause()
  }, [])

  const stop = useCallback(() => {
    controllerRef.current?.stop()
    setPlayback(null)
  }, [])

  const cycleRate = useCallback(() => {
    const next = findNextReadAloudRate(rateRef.current)
    hasChosenRateRef.current = true
    rateRef.current = next
    setRate(next)
    void writeReadAloudRate(next)
    controllerRef.current?.setRate(next)
  }, [])

  /**
   * アプリが前面でなくなったとき（ホームに戻る・画面をロック・着信など）は一時停止する。タイマーが止まるのと合わせる
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") controllerRef.current?.pause()
    })
    return () => subscription.remove()
  }, [])

  /**
   * 上に画面を積んで見えなくなったとき。アンマウントでは呼ばない（解放した player を触らないよう、下の dispose に任せる）
   */
  useEffect(() => {
    if (!isFocused) controllerRef.current?.pause()
  }, [isFocused])

  /**
   * 画面を離れるときに止める（player の解放は useAudioPlayer が行う）
   */
  useEffect(() => () => {
    controllerRef.current?.dispose()
    controllerRef.current = null
  }, [])

  const part = playback && timeline ? timeline.blocks.find(block => block.blockIndex === playback.blockIndex)?.parts[playback.partIndex] : undefined
  const word = playback && playback.wordIndex >= 0 ? part?.words[playback.wordIndex] : undefined
  const reading: ReadAloudReading | null = playback && word
    ? { blockIndex: playback.blockIndex, segmentEnd: word.segmentEnd, segmentStart: word.segmentStart }
    : null
  /**
   * 単語の単位で進める
   */
  const progress = playback && timeline
    ? calculateReadAloudProgress(timeline, { blockIndex: playback.blockIndex, mode: playback.mode, partIndex: playback.partIndex, positionMs: word?.startMs ?? 0 })
    : 0

  return { availability, cycleRate, pause, playback, playBlock, progress, rate, reading, stop, togglePlay }
}
