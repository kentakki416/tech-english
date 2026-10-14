import { useAudioPlayer } from "expo-audio"
import { useState } from "react"

/**
 * めくる音（web のモックの Web Audio の「シュッ」と同じ作り方で書き出した 0.16 秒の WAV）
 */
const FLIP_SOUND = require("../../../assets/sounds/page-flip.wav")

/**
 * カードをめくる効果音（モック）。expo-audio で同梱の音声を鳴らし、オン / オフを切り替えられる
 */
export function useFlipSound() {
  const player = useAudioPlayer(FLIP_SOUND)
  const [isEnabled, setIsEnabled] = useState(true)

  const play = () => {
    if (!isEnabled) return
    void player.seekTo(0)
    player.play()
  }

  return { isEnabled, play, toggle: () => setIsEnabled(value => !value) }
}
