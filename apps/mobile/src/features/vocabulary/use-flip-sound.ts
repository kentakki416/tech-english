import AsyncStorage from "@react-native-async-storage/async-storage"
import { useAudioPlayer } from "expo-audio"
import { useEffect, useState } from "react"

import { requestAudioMode } from "@/libs/audio-mode"

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
 * 鳴らすたびに、消音モードでは鳴らさず・ほかのアプリの音楽を止めない音声のモード（iOS の ambient）を頼み、その設定を待ってから鳴らす
 * （発音・読み上げは消音モードでも鳴らすモードにするので、その後のめくる音が消音モードで鳴らないように。同じモードなら待つだけ）。
 * 画面を開いたときにも先に頼んでおき、最初のめくりで設定を待たないようにする。
 * ambient はカテゴリを変えるだけで音声のセッションを有効にしないので、ほかのアプリの音楽は止まらない
 */
export function useFlipSound() {
  const player = useAudioPlayer(FLIP_SOUND)
  const [isEnabled, setIsEnabled] = useState(true)

  useEffect(() => {
    void requestAudioMode("effect")
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
    void requestAudioMode("effect").then(() => {
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
