import { useEffect, useRef } from "react"
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import Svg, { Path } from "react-native-svg"

import { MOCK_COLORS } from "@/const/mock-theme"

/**
 * モック：単語帳のカードの発音のボタン（vocabulary-pronunciation）。本番は mp3 を鳴らすが、モックは音を出さずに再生中の見た目だけを出す
 */

export type PronunciationTarget = "sentence" | "word"

export type MockPronunciation = {
  /**
   * 1 文の音声があるか（問題の読み上げの音声ができていなければボタンを出さない）
   */
  hasSentence: boolean
  /**
   * 単語の音声ができているか（できていなければ「準備中」で押せない）
   */
  isWordReady: boolean
  onToggle: (target: PronunciationTarget) => void
  playing: PronunciationTarget | null
}

/**
 * 音の波（内側・外側）。web の SpeakerIcon と同じ形
 */
const WAVE_PATHS = ["M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9 9 0 0 1 0 13"]

/**
 * 波 1 本の明滅の半周期（web の sound-wave 900ms の半分）
 */
const WAVE_HALF_MS = 450

/**
 * 外側の波を遅らせる時間（内側 → 外側の順に広がって見える）
 */
const WAVE_DELAY_MS = 200

const PRESSED_BACKGROUND = "rgba(216, 201, 172, 0.6)"

/**
 * 音の波 1 本。再生中は明滅させる（視差効果を減らす設定では動かさず、色だけ変える）
 */
function SoundWave({ color, d, delay, isAnimated, size }: { color: string, d: string, delay: number, isAnimated: boolean, size: number }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isAnimated) return
    const useNativeDriver = Platform.OS !== "web"
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: WAVE_HALF_MS, easing: Easing.inOut(Easing.ease), toValue: 0.25, useNativeDriver }),
        Animated.timing(opacity, { duration: WAVE_HALF_MS, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver }),
      ]),
    )
    const timer = setTimeout(() => loop.start(), delay)
    return () => {
      clearTimeout(timer)
      loop.stop()
      opacity.setValue(1)
    }
  }, [delay, isAnimated, opacity])

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
        <Path d={d} stroke={color} strokeLinecap="round" strokeWidth={1.9} />
      </Svg>
    </Animated.View>
  )
}

/**
 * スピーカーと音の波。波は 1 本ずつ重ねて、別々に明滅させる
 */
function SpeakerIcon({ color, isPlaying, size }: { color: string, isPlaying: boolean, size: number }) {
  const isReducedMotion = useReducedMotion()
  return (
    <View style={{ height: size, width: size }}>
      <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
        <Path d="M11 5 6 9H3v6h3l5 4V5Z" fill={color} fillOpacity={0.15} stroke={color} strokeLinejoin="round" strokeWidth={1.9} />
      </Svg>
      {WAVE_PATHS.map((d, index) => (
        <SoundWave key={d} color={color} d={d} delay={index * WAVE_DELAY_MS} isAnimated={isPlaying && !isReducedMotion} size={size} />
      ))}
    </View>
  )
}

/**
 * 語句のすぐ右の、単語の発音のボタン（見出し語を読む）。押せる範囲は hitSlop で 44pt にする。
 * 準備中も disabled にはしない（disabled の Pressable はタッチを引き受けず、外のカードがめくれるため）。onPress を外して押せなくする
 */
export function WordSoundButton({ lemma, pronunciation, size }: { lemma: string, pronunciation: MockPronunciation, size: "lg" | "sm" }) {
  const isPlaying = pronunciation.playing === "word"
  const dimension = size === "lg" ? 36 : 28
  const color = isPlaying ? MOCK_COLORS.inkAmber : pronunciation.isWordReady ? MOCK_COLORS.inkMuted : "rgba(153, 140, 118, 0.6)"
  return (
    <Pressable
      accessibilityLabel={pronunciation.isWordReady ? `${lemma} の発音を聞く` : `${lemma} の発音は準備中です`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !pronunciation.isWordReady, selected: isPlaying }}
      hitSlop={(44 - dimension) / 2}
      style={({ pressed }) => [
        styles.wordButton,
        { borderRadius: dimension / 2, height: dimension, width: dimension },
        isPlaying && styles.wordButtonPlaying,
        pressed && pronunciation.isWordReady && !isPlaying && { backgroundColor: PRESSED_BACKGROUND },
      ]}
      onPress={pronunciation.isWordReady ? () => pronunciation.onToggle("word") : undefined}
    >
      <SpeakerIcon color={color} isPlaying={isPlaying} size={size === "lg" ? 20 : 16} />
    </Pressable>
  )
}

/**
 * 1 文のすぐ下の、1 文の読み上げのボタン。1 文の音声が無ければ何も出さない。文字は再生中も「この文を聞く」のまま
 */
export function SentenceSoundButton({ align, pronunciation }: { align: "center" | "start", pronunciation: MockPronunciation }) {
  if (!pronunciation.hasSentence) return null
  const isPlaying = pronunciation.playing === "sentence"
  return (
    <Pressable
      accessibilityLabel="この文を聞く"
      accessibilityRole="button"
      accessibilityState={{ selected: isPlaying }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.sentenceButton,
        align === "center" ? styles.sentenceButtonCenter : styles.sentenceButtonStart,
        isPlaying && styles.sentenceButtonPlaying,
        pressed && !isPlaying && { backgroundColor: PRESSED_BACKGROUND },
      ]}
      onPress={() => pronunciation.onToggle("sentence")}
    >
      {isPlaying ? (
        <SpeakerIcon isPlaying color={MOCK_COLORS.inkAmber} size={14} />
      ) : (
        <Svg height={11} viewBox="0 0 12 12" width={11}>
          <Path d="M3 1.8v8.4L10 6 3 1.8Z" fill={MOCK_COLORS.inkMuted} />
        </Svg>
      )}
      <Text style={[styles.sentenceLabel, isPlaying && styles.sentenceLabelPlaying]}>この文を聞く</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sentenceButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sentenceButtonCenter: {
    alignSelf: "center",
  },
  /**
   * 1 文の再生中は琥珀の地だけ（縁は単語のボタンだけ。UI 設計）
   */
  sentenceButtonPlaying: {
    backgroundColor: "rgba(243, 178, 76, 0.2)",
  },
  sentenceButtonStart: {
    alignSelf: "flex-start",
    marginLeft: -10,
  },
  sentenceLabel: {
    color: MOCK_COLORS.inkMuted,
    fontSize: 12,
  },
  sentenceLabelPlaying: {
    color: MOCK_COLORS.inkAmber,
  },
  wordButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  wordButtonPlaying: {
    backgroundColor: "rgba(243, 178, 76, 0.2)",
    borderColor: "rgba(148, 96, 15, 0.35)",
    borderWidth: StyleSheet.hairlineWidth,
  },
})
