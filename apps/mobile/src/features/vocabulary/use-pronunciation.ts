import { useEventListener } from "expo"
import { useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"

import { requestAudioMode } from "@/libs/audio-mode"

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
  stop: () => void
  /**
   * 同じものを再生中なら止める。別のものを再生中なら止めてから鳴らす
   */
  toggle: (target: PronunciationTarget, source: PronunciationSource) => void
}

/**
 * 今の再生。token は再生ごとに作り、前の再生の Promise・タイマーが次の再生を止めないようにする。
 * phase は、音声のモードの切り替えを待っている間（mode）、読み込みを待っている間（loading）、play() を呼んで鳴り始めるのを待っている間（starting）、
 * 鳴っている間（playing）
 */
type ActivePlayback = {
  phase: "loading" | "mode" | "playing" | "starting"
  source: PronunciationSource
  target: PronunciationTarget
  token: symbol
}

/**
 * 単語の終わりに足す余白（鳴り終わってから表示を戻す）。1 文は区間の終わりが次の単語の始まりで文の後の間を含むので、余白は足さない
 */
const WORD_TAIL_MS = 150

/**
 * replace してから・play() してから、この時間たっても読み込めない・鳴り始めなければ失敗として止める
 * （AudioStatus にはエラーが無いため。読み上げと同じ）
 */
const LOAD_TIMEOUT_MS = 10_000

/**
 * 単語の mp3 の長さが分からない端末で、再生中の表示を戻すまでの時間（見出し語の発音はこれより短い）
 */
const WORD_FALLBACK_MS = 3000

/**
 * playbackStatusUpdate の間隔（鳴り始めを見つけて、終わりのタイマーを置くまでの遅れ）
 */
const STATUS_UPDATE_INTERVAL_MS = 100

/**
 * カードの発音の再生（vocabulary-pronunciation README「再生の実装」）。1 回分の画面で 1 つだけ持ち、expo-audio の player を 1 つ使い回す。
 *
 * 押したら音声のモード（消音モードでも鳴らし、ほかのアプリの音楽は小さくする）を待って replace し、読み込めたら区間の始めに合わせて鳴らす。
 * 止めるのはタイマー。鳴り始めた（player.playing で、再生位置が区間の始めより進んだ）ときの再生位置から、区間の終わり（単語は mp3 の終わり + 余白）
 * までの時間で置く（play() の時点から数えると、seek した先の読み込みが遅いときに文の最後が切れるため。web の expo-audio は play() の時点で
 * player.playing を true にするので、再生位置が進んだかでも確かめる。読み上げと同じ）。
 * 終わりの通知（didJustFinish）は前の再生のものが遅れて届くことがあるので使わない。
 *
 * expo-audio は、アプリが背面に移ったとき・一時的に音声を取られたときに止めた player を、前面に戻ったときに鳴らし直す。
 * 止めた後に鳴っているのを見つけたら止め直す（止めたのに段落の続きが鳴り続けないように）
 */
export function usePronunciation(): Pronunciation {
  const player = useAudioPlayer(null, { updateInterval: STATUS_UPDATE_INTERVAL_MS })
  const [playing, setPlaying] = useState<PronunciationTarget | null>(null)
  const activeRef = useRef<ActivePlayback | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  /**
   * useAudioPlayer が先に player を解放していたら（画面を離れたとき）pause は投げるので無視する（解放で再生も止まっている）
   */
  const pausePlayer = useCallback(() => {
    try {
      player.pause()
    } catch {
      /**
       * 解放済み
       */
    }
  }, [player])

  /**
   * 止めて、押す前の状態に戻す。OS が鳴らし直した後でも止まるよう、再生中かに関わらず pause する
   */
  const stop = useCallback(() => {
    clearTimer()
    activeRef.current = null
    setPlaying(null)
    pausePlayer()
  }, [pausePlayer])

  /**
   * ms 後に、同じ再生のままなら止める（読み込み・鳴り始めの見張りと、区間の終わりに使う）
   */
  const scheduleStop = (token: symbol, ms: number) => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      if (activeRef.current?.token === token) stop()
    }, ms)
  }

  /**
   * 読み込めたら、区間の始めに seek して鳴らす。鳴り始めるまでは失敗の見張りのタイマーだけを置く
   */
  const playFromSegmentStart = (active: ActivePlayback) => {
    active.phase = "starting"
    const startMs = active.source.startMs ?? 0
    const begin = () => {
      if (activeRef.current?.token !== active.token) return
      player.play()
      scheduleStop(active.token, LOAD_TIMEOUT_MS)
    }
    if (startMs === 0) {
      begin()
      return
    }
    /**
     * iOS は許容誤差を省くと速さを優先して前後にずれた位置へ seek するので、0 にして区間の始めに合わせる（Android は無視する）
     */
    player.seekTo(startMs / 1000, 0, 0).then(begin).catch(() => {
      if (activeRef.current?.token === active.token) stop()
    })
  }

  /**
   * 鳴り始めたら、今の再生位置から終わりまでの時間でタイマーを置く
   */
  const scheduleEnd = (active: ActivePlayback) => {
    active.phase = "playing"
    const positionMs = player.currentTime * 1000
    const durationMs = player.duration * 1000
    const endMs = active.source.endMs
      ?? (Number.isFinite(durationMs) && durationMs > 0 ? durationMs : positionMs + WORD_FALLBACK_MS) + WORD_TAIL_MS
    scheduleStop(active.token, Math.max(endMs - positionMs, 0))
  }

  /**
   * 読み込みの完了・鳴り始めは player の今の値で確かめる（status は前の再生のものが遅れて届くことがあり、status.isLoaded は web では常に true のため）
   */
  useEventListener(player, "playbackStatusUpdate", (status) => {
    const active = activeRef.current
    if (!active || active.phase === "mode") {
      if (status.playing) pausePlayer()
      return
    }
    if (active.phase === "loading" && player.isLoaded) playFromSegmentStart(active)
    else if (active.phase === "starting" && player.playing && player.currentTime * 1000 > (active.source.startMs ?? 0)) scheduleEnd(active)
  })

  const toggle = (target: PronunciationTarget, source: PronunciationSource) => {
    /**
     * 同じ段落の mp3 を別のカードの 1 文で鳴らすこともあるので、URL に加えて始めの位置でも比べる
     */
    const current = activeRef.current
    const isSame = current?.target === target && current.source.url === source.url && current.source.startMs === source.startMs
    stop()
    if (isSame) return

    const active: ActivePlayback = { phase: "mode", source, target, token: Symbol(target) }
    activeRef.current = active
    setPlaying(target)
    void requestAudioMode("pronunciation").then(() => {
      if (activeRef.current?.token !== active.token) return
      active.phase = "loading"
      player.replace({ uri: source.url })
      scheduleStop(active.token, LOAD_TIMEOUT_MS)
    })
  }

  /**
   * アプリが前面でなくなったとき（ホームに戻る・画面をロック・着信など）は止める
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop()
    })
    return () => subscription.remove()
  }, [stop])

  /**
   * 画面を離れるときに止める（player の解放は useAudioPlayer が行う）
   */
  useEffect(() => () => stop(), [stop])

  return { playing, stop, toggle }
}
