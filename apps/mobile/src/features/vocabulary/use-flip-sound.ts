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
 * 初めて鳴らすときに、消音モードでは鳴らさず・ほかのアプリの音楽を止めない音声のモード（iOS の ambient）にする。
 * 読み上げは再生を始めるときに自分のモード（消音モードでも鳴らす）にし直すので、こちらで変えても読み上げは困らない
 */
export function useFlipSound() {
  const player = useAudioPlayer(FLIP_SOUND)
  const [isEnabled, setIsEnabled] = useState(true)
  const isAudioModeRequestedRef = useRef(false)

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
    if (!isAudioModeRequestedRef.current) {
      isAudioModeRequestedRef.current = true
      void setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false, shouldPlayInBackground: false })
        .catch((error: unknown) => console.warn("Failed to set audio mode:", error))
    }
    void player.seekTo(0)
    player.play()
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
