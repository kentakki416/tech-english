import { useIsFocused } from "@react-navigation/native"
import { useEventListener } from "expo"
import { type AudioPlayer, type AudioStatus, type PitchCorrectionQuality, useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Platform } from "react-native"

import type { AttemptBlock } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"
import { requestAudioMode } from "@/libs/audio-mode"

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
 * 音声の情報の状態。loading は画面を開いてから取得が終わるまで、error は取得か再生の失敗（どちらも時刻表を捨ててあり、再生ボタンで取り直す）
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
   * 音声の読み込みの失敗。再生は止めてから呼ぶ（呼び出し側は時刻表を捨てて、次の再生ボタンでマニフェストを取り直す）
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
 * replace の後、status.duration（秒）がこのパートの durationMs（マニフェストの mp3 のフレームから求めた長さ）とこの範囲で合う更新を、
 * このパートの更新とみなす（ネイティブからの更新は非同期に届くので、replace より前に送られた前のパートの更新が何件も後から届くことがある）
 */
const PART_DURATION_TOLERANCE_MS = 250

/**
 * 前のパートと長さが PART_DURATION_TOLERANCE_MS 以内で区別できないときは、再生位置がこれ未満の更新だけをこのパートのものとみなす
 * （このパートは最初から鳴らすので、最初の更新の位置は 0 に近い。前のパートの終わりの更新は位置が長さと同じになる）
 */
const STALE_STATUS_MIN_MS = 1000

/**
 * replace からこの時間たっても長さの合う更新が来なければ、長さを問わずこのパートの更新とみなす（長さの報告が manifest とずれる端末でも
 * 単語の追跡とパートの終わりの処理を止めないため。前のパートの更新は replace の直後に届き終える）
 */
const STALE_STATUS_MAX_DELAY_MS = 2000

/**
 * didJustFinish を受けたとき、player の今の再生位置がパートの終わりからこの範囲にあれば、このパートの終わりとみなす
 */
const PART_END_TOLERANCE_MS = 250

/**
 * 外から止めた後、止めた位置よりこの分だけ進んだ playing の更新が来たら、OS が再生を戻したとみなす（再生位置の誤差を見込む）
 */
const RESUMED_POSITION_MARGIN_MS = 200

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
   * replace の後、このパートの更新だと分かる更新がまだ届いていない（届くまでの更新は前のパートのものとして捨てる）
   */
  let isAwaitingPartStatus = false
  /**
   * player に今 replace してあるパートの長さと、その前に replace してあったパートの長さ（前のパートの更新と見分けるのに使う）。
   * 停止しても player には前のパートが残るので、停止では消さない
   */
  let loadedPartDurationMs: number | null = null
  let previousPartDurationMs: number | null = null
  let replacedAt = 0
  /**
   * 外から止めた（一時停止の操作・上部バーの一時停止・アプリが前面でなくなった・上に画面を積んだ。pause()）。
   * 立っている間にパートの終わり（didJustFinish）が届いたら、次のパートを replace するだけで play() しない（止める直前にパートが終わっていると、
   * 止めた後に終わりの更新が届いて次のパートが勝手に鳴るため）。再開（toggle）と、自分の操作で始めたとき（start）と、
   * OS が再生を戻したとき（isResumedByOs）に下ろす
   */
  let isPauseRequested = false
  /**
   * 外から止めた時刻と位置（パートを replace したときはその時刻と 0）。OS が再生を戻したかを、その後に届いた更新と比べて見分ける
   */
  let pausedAt = 0
  let pausedPositionMs = 0
  /**
   * このパートで status.playing を見たか。再生を始める前に届いた didJustFinish は前のパートのものとして無視する
   */
  let hasPlayedPart = false
  /**
   * このパートの didJustFinish を処理したか（web・Android は終わりの更新が 2 回届くことがある）
   */
  let hasFinishedPart = false
  let loadTimer: ReturnType<typeof setTimeout> | null = null
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
    isPauseRequested = false
    player.pause()
    events.onPlaybackChange(() => null)
  }

  /**
   * パートを最初から再生する。shouldPlay が false なら replace するだけで play() せず、一時停止の表示にする（再開すると最初から鳴る）。
   * 読み込みに失敗しても AudioStatus にはエラーが無いので、10 秒たっても読み込めていなければ止める
   */
  const startPart = (blockIndex: number, partIndex: number, mode: ReadAloudMode, options: { shouldPlay: boolean }) => {
    const part = findBlock(blockIndex)?.parts[partIndex]
    if (!part) return
    cursor = { blockIndex, mode, partIndex }
    wordIndex = -1
    isPlaying = options.shouldPlay
    isStarting = options.shouldPlay
    isAwaitingPartStatus = true
    hasPlayedPart = false
    hasFinishedPart = false
    previousPartDurationMs = loadedPartDurationMs
    loadedPartDurationMs = part.durationMs
    replacedAt = Date.now()
    pausedAt = replacedAt
    pausedPositionMs = 0
    events.onPlaybackChange(() => ({ blockIndex, isPlaying: options.shouldPlay, mode, partIndex, wordIndex: -1 }))
    player.replace({ uri: part.url })
    /**
     * replace の後は速度が戻ることがあるので、パートごとに設定し直す
     */
    player.shouldCorrectPitch = true
    player.setPlaybackRate(rate, PITCH_CORRECTION_QUALITY)
    if (options.shouldPlay) player.play()
    clearLoadTimer()
    loadTimer = setTimeout(() => {
      loadTimer = null
      if (player.isLoaded) return
      stop()
      events.onError()
    }, LOAD_TIMEOUT_MS)
  }

  /**
   * 同じブロックの次のパート → 全文なら次のブロック → 終わり の順。外から止めた後に届いたパートの終わりなら、次のパートを一時停止のまま用意する。
   * 次が無ければ（段落の再生の最後・全文の最後）止めたかに関わらず待機に戻す
   */
  const startNextPart = (current: PlaybackCursor) => {
    const shouldPlay = !isPauseRequested
    const block = findBlock(current.blockIndex)
    if (block && current.partIndex + 1 < block.parts.length) {
      startPart(block.blockIndex, current.partIndex + 1, current.mode, { shouldPlay })
      return
    }
    const nextBlock = current.mode === "all" ? findNextBlock(current.blockIndex) : undefined
    if (nextBlock) {
      startPart(nextBlock.blockIndex, 0, "all", { shouldPlay })
      return
    }
    stop()
  }

  /**
   * replace の後に届いた更新が、今のパートのものか。status.duration が今のパートの長さと合うものだけを今のパートのものとし、
   * 長さがまだ分からない（0・NaN）更新と前のパートの長さの更新は捨てる。前のパートと長さで区別できないときは、再生位置が 1 秒未満のものだけにする
   * （1 秒未満の短いパートどうしを切り替えた直後に限り、前のパートの終わりの更新を取り違えることがある。そのときは次のパートへ早く進む）。
   * replace から 2 秒たっても合わなければ、長さを問わず今のパートのものとする
   */
  const isCurrentPartStatus = (status: AudioStatus, partDurationMs: number): boolean => {
    if (Date.now() - replacedAt >= STALE_STATUS_MAX_DELAY_MS) return true
    const durationMs = status.duration * 1000
    if (!Number.isFinite(durationMs) || durationMs <= 0) return false
    if (Math.abs(durationMs - partDurationMs) > PART_DURATION_TOLERANCE_MS) return false
    const isAmbiguous = previousPartDurationMs !== null && Math.abs(previousPartDurationMs - partDurationMs) <= PART_DURATION_TOLERANCE_MS
    return !isAmbiguous || status.currentTime * 1000 < STALE_STATUS_MIN_MS
  }

  /**
   * player の今の再生位置が、今のパートの終わりにあるか。iOS の expo-audio は終わりの更新の currentTime を player の長さに書き換えて送るので、
   * status ではなく player から読む（他の player の終わりの通知を受けても、この player の位置で見分けられるように）。
   * 終わりは player の長さとマニフェストの長さの短いほう（mp3 の長さの見積もりがずれる端末でも、本当の終わりを取りこぼさない）
   */
  const isPlayerAtPartEnd = (partDurationMs: number): boolean => {
    const playerDurationMs = player.duration * 1000
    const endMs = Number.isFinite(playerDurationMs) && playerDurationMs > 0 ? Math.min(playerDurationMs, partDurationMs) : partDurationMs
    return player.currentTime * 1000 >= endMs - PART_END_TOLERANCE_MS
  }

  /**
   * 外から止めた後に、自分の操作を通らずに再生が戻ったか（電話・Siri などの割り込みの終わりや、アプリが前面に戻ったときに、expo-audio の
   * ネイティブが止める前に鳴っていた player を play し直す）。止めた・パートを替えた直後に届く古い更新（playing: true のまま）と
   * 取り違えないよう、2 秒以上たってから、止めた位置より進んだ playing の更新だけを見る
   */
  const isResumedByOs = (status: AudioStatus): boolean =>
    status.playing
    && Date.now() - pausedAt >= STALE_STATUS_MAX_DELAY_MS
    && status.currentTime * 1000 > pausedPositionMs + RESUMED_POSITION_MARGIN_MS

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

  /**
   * 外から止める（一時停止の操作・上部バーの一時停止・アプリが前面でなくなった・上に画面を積んだ）。待機中は何もしない
   */
  const pause = () => {
    if (!cursor) return
    isPauseRequested = true
    player.pause()
    pausedAt = Date.now()
    pausedPositionMs = player.currentTime * 1000
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

    if (isAwaitingPartStatus) {
      const partDurationMs = block.parts[cursor.partIndex]?.durationMs ?? 0
      if (!isCurrentPartStatus(status, partDurationMs)) return
      isAwaitingPartStatus = false
    }
    const positionMs = status.currentTime * 1000
    if (status.didJustFinish) {
      /**
       * パートの長さが合っていても（上の判定）、player の位置が終わりに無ければこのパートの終わりではないとして捨てる
       * （他の player の終わりの通知を受けても、一時停止中のパートを次のパートに差し替えないため）
       */
      const partDurationMs = block.parts[cursor.partIndex]?.durationMs ?? 0
      if (hasPlayedPart && !hasFinishedPart && isPlayerAtPartEnd(partDurationMs)) {
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
      /**
       * OS が再生を戻したら「止めた」印を下ろす（下ろさないとパートの終わりで次のパートを用意するだけになり、段落の境目で止まる）
       */
      if (isPauseRequested && isResumedByOs(status)) isPauseRequested = false
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
      isPauseRequested = false
      /**
       * 消音モードでも鳴らし、ほかのアプリの音楽は止める。再生を始めるたびに頼む（画面を開いただけではほかのアプリの音を止めない。
       * 単語帳のめくる音・発音でモードが変わっていても戻す。同じモードなら何もしない）。失敗しても再生は続ける。
       * 設定は待たない（replace したパートの mp3 を読み込む間に終わる。待つとパートの開始と状態の更新の順が変わる）
       */
      void requestAudioMode("readAloud")
      startPart(input.blockIndex, 0, input.mode, { shouldPlay: true })
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
      isPauseRequested = false
      /**
       * 画面を離れている間に届いたパートの終わりは捨てるので、終わったまま戻ってきたら次のパートから鳴らす
       * （そのまま play すると終わった位置から動かず、再生中の表示のまま止まる）
       */
      const partDurationMs = findBlock(cursor.blockIndex)?.parts[cursor.partIndex]?.durationMs ?? 0
      if (hasPlayedPart && !hasFinishedPart && isPlayerAtPartEnd(partDurationMs)) {
        hasFinishedPart = true
        startNextPart(cursor)
        return
      }
      isStarting = true
      updateIsPlaying(true)
      void requestAudioMode("readAloud")
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
   * 増やすと音声の情報を取り直す（取得・再生の失敗の後に再生ボタンを押したとき）
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
  /**
   * 画面が見えているか（上に別の画面を積んでいる間は false）。その間の再生の状態の更新は捨てる
   */
  const isFocusedRef = useRef(isFocused)

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

  /**
   * 取得・再生の失敗。時刻表を捨てて、次の再生ボタンでマニフェストを取り直す（再公開で音声が作り直されて古い mp3 が消えていると、
   * 同じ時刻表の URL では失敗し続けるため）
   */
  const markPlaybackFailed = useCallback(() => {
    timelineRef.current = null
    setTimeline(null)
    updateAvailability("error")
  }, [updateAvailability])

  const getController = useCallback((): ReadAloudController => {
    controllerRef.current ??= createReadAloudController(player, {
      onError: markPlaybackFailed,
      onListened: blockIndex => onBlockListenedRef.current?.(blockIndex),
      onPlaybackChange: setPlayback,
    })
    return controllerRef.current
  }, [markPlaybackFailed, player])

  /**
   * 画面を離れている（上に画面を積んでいる）間の更新は捨てる（その間は一時停止している。積んだ画面の player のパートの終わりの通知を
   * 受けても、一時停止中なのに次のパートに差し替えないため。捨てたこの player の終わりは、戻って再開したときに toggle が拾う）
   */
  useEventListener(player, "playbackStatusUpdate", (status) => {
    if (!isFocusedRef.current) return
    controllerRef.current?.handleStatus(status)
  })

  const startPlayback = useCallback((currentTimeline: ReadAloudTimeline, blockIndex: number, mode: ReadAloudMode) => {
    getController().start({ blockIndex, mode, rate: rateRef.current, timeline: currentTimeline })
  }, [getController])

  const togglePlay = useCallback(() => {
    /**
     * 取得・再生の失敗の後は取り直すだけ（取り直したら待機に戻り、もう一度押すと再生する）
     */
    if (availabilityRef.current === "error") {
      updateAvailability("loading")
      setFetchCount(count => count + 1)
      return
    }
    const currentTimeline = timelineRef.current
    const firstBlock = currentTimeline?.blocks[0]
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
    isFocusedRef.current = isFocused
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
