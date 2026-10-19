import { useAudioPlayer } from "expo-audio"
import { useCallback, useEffect, useSyncExternalStore } from "react"

import { requestAudioMode } from "@/libs/audio-mode"

import { readSoundEffectSetting, subscribeSoundEffectSetting, toggleSoundEffectSetting } from "./sound-effect-setting"

/**
 * 選択肢を選んだときの「ポキン」は web の choice-pop.ts から `pnpm --filter web sound:choice-pop` で書き出した WAV、
 * めくる音は web の Web Audio の「シュッ」と同じ作り方で書き出した 0.16 秒の WAV
 */
const CHOICE_SOUND = require("../../../assets/sounds/choice-pop.wav")
const FLIP_SOUND = require("../../../assets/sounds/page-flip.wav")

/**
 * 効果音（単語帳のめくる音・解答画面のポキン）。expo-audio で同梱の音声を鳴らし、オン / オフは画面をまたいで 1 つの設定に覚える。
 *
 * 鳴らすたびに、消音モードでは鳴らさず・ほかのアプリの音楽を止めない音声のモード（iOS の ambient）を頼み、その設定を待ってから鳴らす
 * （発音・読み上げは消音モードでも鳴らすモードにするので、その後の効果音が消音モードで鳴らないように。同じモードなら待つだけ）。
 * 画面を開いたときにも先に頼んでおき、最初の 1 回で設定を待たないようにする。
 * ambient はカテゴリを変えるだけで音声のセッションを有効にしないので、ほかのアプリの音楽は止まらない。
 * 返す関数は、オン / オフが変わるまで同じ参照
 */
export function useSoundEffects() {
  const flipPlayer = useAudioPlayer(FLIP_SOUND)
  const choicePlayer = useAudioPlayer(CHOICE_SOUND)
  const isEnabled = useSyncExternalStore(subscribeSoundEffectSetting, readSoundEffectSetting)

  useEffect(() => {
    void requestAudioMode("effect")
  }, [])

  const playFlip = useCallback(() => {
    if (!isEnabled) return
    void requestAudioMode("effect").then(() => {
      void flipPlayer.seekTo(0)
      flipPlayer.play()
    })
  }, [flipPlayer, isEnabled])

  const playChoice = useCallback(() => {
    if (!isEnabled) return
    void requestAudioMode("effect").then(() => {
      void choicePlayer.seekTo(0)
      choicePlayer.play()
    })
  }, [choicePlayer, isEnabled])

  return { isEnabled, playChoice, playFlip, toggle: toggleSoundEffectSetting }
}
