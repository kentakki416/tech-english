import { useEffect, useRef } from "react"
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import Svg, { Path } from "react-native-svg"

import { THEME_COLORS } from "@/const/design-theme"
import type { PronunciationTarget } from "@/features/vocabulary/use-pronunciation"

import { PAPER_MAX_FONT_SCALE } from "./SentenceText"

/**
 * カードに渡す発音の操作。鳴らせるか（音声があるか）はカードの pronunciation から決める
 */
export type PronunciationControls = {
  playing: PronunciationTarget | null
  onToggle: (target: PronunciationTarget) => void
}

/**
 * 音の波（内側・外側）。web の SpeakerIcon・上部バーの効果音のアイコンと同じ形
 */
const WAVE_PATHS = ["M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9 9 0 0 1 0 13"]

/**
 * 波 1 本の明滅の半周期（web の sound-wave 900ms の半分）と、外側の波を遅らせる時間（内側から広がって見える）
 */
const WAVE_HALF_MS = 450
const WAVE_DELAY_MS = 200

/**
 * ネイティブドライバは iOS / Android だけ（react-native-web は対応していない）
 */
const USE_NATIVE_DRIVER = Platform.OS !== "web"

/**
 * 押せる範囲の最小の大きさ（Apple の HIG の 44pt）
 */
const MIN_TOUCH_SIZE = 44

const PRESSED_BACKGROUND = "rgba(216, 201, 172, 0.6)"

/**
 * 音の波 1 本。再生中は明滅させる
 */
function SoundWave({ color, d, delay, isAnimated, size }: { color: string, d: string, delay: number, isAnimated: boolean, size: number }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isAnimated) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: WAVE_HALF_MS, easing: Easing.inOut(Easing.ease), toValue: 0.25, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { duration: WAVE_HALF_MS, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }),
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
 * スピーカーと音の波。波は 1 本ずつ重ねて別々に明滅させる（視差効果を減らす設定では動かさず、色だけ変える）
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
 * 語句のすぐ右の、単語の発音のボタン（見出し語を読む）。音声がまだできていなければ「準備中」で押せない。
 * カード（Pressable）の中の Pressable なので、押してもカードの onPress（めくる）は呼ばれない。
 * 準備中も disabled にはしない（disabled の Pressable はタッチを引き受けず、外のカードがめくれてしまうため）。onPress を外して押せなくする
 */
export function WordSoundButton({
  controls,
  isReady,
  lemma,
  size,
}: {
  controls: PronunciationControls
  isReady: boolean
  lemma: string
  size: "lg" | "sm"
}) {
  const isPlaying = controls.playing === "word"
  const dimension = size === "lg" ? 36 : 28
  const color = isPlaying ? THEME_COLORS.inkAmber : isReady ? THEME_COLORS.inkMuted : "rgba(153, 140, 118, 0.6)"
  return (
    <Pressable
      accessibilityLabel={isReady ? `${lemma} の発音を聞く` : `${lemma} の発音は準備中です`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !isReady, selected: isPlaying }}
      hitSlop={(MIN_TOUCH_SIZE - dimension) / 2}
      onPress={isReady ? () => controls.onToggle("word") : undefined}
      style={({ pressed }) => [
        styles.wordButton,
        { borderRadius: dimension / 2, height: dimension, width: dimension },
        isPlaying && styles.playing,
        pressed && isReady && !isPlaying && styles.pressed,
      ]}
    >
      <SpeakerIcon color={color} isPlaying={isPlaying} size={size === "lg" ? 20 : 16} />
    </Pressable>
  )
}

/**
 * 1 文のすぐ下の、1 文の読み上げのボタン（1 文の音声があるときだけ置く）。表は中央、裏は左寄せで三角を 1 文の頭にそろえる
 */
export function SentenceSoundButton({ align, controls }: { align: "center" | "start", controls: PronunciationControls }) {
  const isPlaying = controls.playing === "sentence"
  return (
    <Pressable
      accessibilityLabel="この文を聞く"
      accessibilityRole="button"
      accessibilityState={{ selected: isPlaying }}
      hitSlop={8}
      onPress={() => controls.onToggle("sentence")}
      style={({ pressed }) => [
        styles.sentenceButton,
        align === "center" ? styles.sentenceButtonCenter : styles.sentenceButtonStart,
        isPlaying && styles.playing,
        pressed && !isPlaying && styles.pressed,
      ]}
    >
      {isPlaying ? (
        <SpeakerIcon color={THEME_COLORS.inkAmber} isPlaying size={14} />
      ) : (
        <Svg height={11} viewBox="0 0 12 12" width={11}>
          <Path d="M3 1.8v8.4L10 6 3 1.8Z" fill={THEME_COLORS.inkMuted} />
        </Svg>
      )}
      <Text maxFontSizeMultiplier={PAPER_MAX_FONT_SCALE} style={[styles.sentenceLabel, isPlaying && styles.sentenceLabelPlaying]}>
        {isPlaying ? "この文を再生中" : "この文を聞く"}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  playing: {
    backgroundColor: "rgba(243, 178, 76, 0.2)",
    borderColor: "rgba(148, 96, 15, 0.35)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    backgroundColor: PRESSED_BACKGROUND,
  },
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
   * 左の余白の分だけ左へずらし、三角を 1 文の頭にそろえる
   */
  sentenceButtonStart: {
    alignSelf: "flex-start",
    marginLeft: -10,
  },
  sentenceLabel: {
    color: THEME_COLORS.inkMuted,
    fontSize: 12,
  },
  sentenceLabelPlaying: {
    color: THEME_COLORS.inkAmber,
  },
  wordButton: {
    alignItems: "center",
    justifyContent: "center",
  },
})
