import AsyncStorage from "@react-native-async-storage/async-storage"
import { setAudioModeAsync, useAudioPlayer } from "expo-audio"
import { useEffect, useRef, useState } from "react"

/**
 * めくる音（web の Web Audio の「シュッ」と同じ作り方で書き出した 0.16 秒の WAV）
 */
const FLIP_SOUND = require("../../../assets/sounds/page-flip.wav")

/**
 * 効果音のオン / オフ（web は localStorage の同じキー）。アカウント削除の AsyncStorage.clear() で一緒に消える
 */
const SOUND_STORAGE_KEY = "tech-english:vocabulary-sound"

/**
 * カードをめくる効果音。expo-audio で同梱の音声を鳴らし、オン / オフを端末に覚える。
 *
 * 画面を開いたときに、消音モードでは鳴らさず・ほかのアプリの音楽を止めない音声のモード（iOS の ambient）にし、鳴らすときはその設定を待つ
 * （setAudioModeAsync は後から効くので、待たずに鳴らすと最初の 1 回だけ前のモードで鳴る）。ambient はカテゴリを変えるだけで
 * 音声のセッションを有効にしないので、開いただけでほかのアプリの音楽は止まらない。
 * 読み上げは再生を始めるときに自分のモード（消音モードでも鳴らす）にし直すので、こちらで変えても読み上げは困らない
 */
export function useFlipSound() {
  const player = useAudioPlayer(FLIP_SOUND)
  const [isEnabled, setIsEnabled] = useState(true)
  const audioModeRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    audioModeRef.current = setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false, shouldPlayInBackground: false })
      .catch((error: unknown) => console.warn("Failed to set audio mode:", error))
  }, [])

  useEffect(() => {
    let isActive = true
    AsyncStorage.getItem(SOUND_STORAGE_KEY)
      .then((stored) => {
        if (isActive && stored === "off") setIsEnabled(false)
      })
      .catch((error: unknown) => console.warn("Failed to read vocabulary sound setting:", error))
    return () => {
      isActive = false
    }
  }, [])

  const play = () => {
    if (!isEnabled) return
    void (audioModeRef.current ?? Promise.resolve()).then(() => {
      void player.seekTo(0)
      player.play()
    })
  }

  /**
   * 保存に失敗しても、開いている画面では切り替えた設定で鳴らす
   */
  const toggle = () => {
    const next = !isEnabled
    setIsEnabled(next)
    void AsyncStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off")
      .catch((error: unknown) => console.warn("Failed to save vocabulary sound setting:", error))
  }

  return { isEnabled, play, toggle }
}
