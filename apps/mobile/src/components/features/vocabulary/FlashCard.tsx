import * as Haptics from "expo-haptics"
import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import { THEME_COLORS } from "@/const/design-theme"
import { useActiveSeconds } from "@/libs/use-active-seconds"

import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet, type VocabularyCard } from "./PaperCard"

type Grade = ReviewVocabularyCardRequest["grade"]

/**
 * ネイティブドライバは iOS / Android だけ（react-native-web は対応していない）
 */
const USE_NATIVE_DRIVER = Platform.OS !== "web"

/**
 * めくる時間と、面を差し替える時刻（カードが真横を向いた瞬間）。web と同じ
 */
const FLIP_DURATION_MS = 440
const FLIP_HALF_MS = 220

/**
 * 答えたカードが横に飛んでいく時間と、次のカードが束から上がってくる時間
 */
const LEAVE_DURATION_MS = 280
const RISE_DURATION_MS = 280

/**
 * これより横に動かして離したら答えとみなす（画面幅に対する割合）
 */
const SWIPE_THRESHOLD_RATIO = 0.3

/**
 * 横にこれより動き、縦より大きく動いたときだけスワイプを始める（タップや縦の動きと取り合わない）
 */
const SWIPE_START_DISTANCE = 10

/**
 * カードの高さ。背の低い端末では画面の高さに合わせて縮める
 */
const CARD_MAX_HEIGHT = 420
const CARD_HEIGHT_RATIO = 0.55

/**
 * 読み上げで伝える表の中身（語句と、バッククォートを除いた本文の 1 文）
 */
const buildFrontLabel = (card: VocabularyCard): string =>
  card.sentence ? `${card.surface}。${card.sentence.text.replaceAll("`", "")}` : card.surface

/**
 * 1 枚分（key でカードごとに作り直す）。めくる・答える・見ていた秒数・スワイプを持つ。
 *
 * タップでめくり（横に回って真横で面を差し替える）、めくった後はボタンか左右のスワイプ（右が覚えた、左がまだ）で答える。
 * 答えると軽く振動し、カードが横に飛んでから onAnswer を呼ぶ。視差効果を減らす設定では動きを省いて切り替えだけにする
 */
export function FlashCard({
  card,
  isReducedMotion,
  remainingCount,
  onAnswer,
  onFlip,
}: {
  card: VocabularyCard
  isReducedMotion: boolean
  /**
   * このカードの後ろに残っている枚数（束の厚み）
   */
  remainingCount: number
  onAnswer: (grade: Grade, activeSeconds: number) => void
  onFlip: () => void
}) {
  const { height, width } = useWindowDimensions()
  const [isFlipped, setIsFlipped] = useState(false)
  const [shownFlipped, setShownFlipped] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const activeSeconds = useActiveSeconds({ initialSeconds: 0, isRunning: !isLeaving })
  const flipProgress = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current
  const drag = useRef(new Animated.Value(0)).current
  const leave = useRef(new Animated.Value(0)).current
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardHeight = Math.min(CARD_MAX_HEIGHT, Math.round(height * CARD_HEIGHT_RATIO))

  const answer = (grade: Grade) => {
    if (!isFlipped || isLeaving) return
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const seconds = activeSeconds
    if (isReducedMotion) {
      onAnswer(grade, seconds)
      return
    }
    setIsLeaving(true)
    Animated.timing(leave, {
      duration: LEAVE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      toValue: grade === "remembered" ? 1 : -1,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => onAnswer(grade, seconds))
  }

  const flip = () => {
    if (isLeaving) return
    const next = !isFlipped
    setIsFlipped(next)
    onFlip()
    /**
     * Android はカードの accessibilityLiveRegion が、変わったラベル（語句と意味）を読み上げる
     */
    if (next && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(card.meaning_ja)
    if (isReducedMotion) {
      setShownFlipped(next)
      return
    }
    flipProgress.setValue(0)
    Animated.timing(flipProgress, { duration: FLIP_DURATION_MS, easing: Easing.bezier(0.45, 0, 0.25, 1), toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }).start()
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    flipTimerRef.current = setTimeout(() => setShownFlipped(next), FLIP_HALF_MS)
  }

  /**
   * PanResponder は 1 回だけ作るので、今の状態と答えの関数は ref で最新を参照する
   */
  const latestRef = useRef({ answer, isFlipped, isLeaving, swipeThreshold: width * SWIPE_THRESHOLD_RATIO })
  useEffect(() => {
    latestRef.current = { answer, isFlipped, isLeaving, swipeThreshold: width * SWIPE_THRESHOLD_RATIO }
  })

  const panResponder = useRef(
    PanResponder.create({
      /**
       * めくる前は引き受けない（意味を見ずに答えられないように）
       */
      onMoveShouldSetPanResponder: (_, gesture) =>
        latestRef.current.isFlipped
        && !latestRef.current.isLeaving
        && Math.abs(gesture.dx) > SWIPE_START_DISTANCE
        && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => drag.setValue(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < latestRef.current.swipeThreshold) {
          Animated.spring(drag, { friction: 6, toValue: 0, useNativeDriver: USE_NATIVE_DRIVER }).start()
          return
        }
        latestRef.current.answer(gesture.dx > 0 ? "remembered" : "forgot")
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER }).start(),
    }),
  ).current

  useEffect(() => {
    if (!isReducedMotion) {
      Animated.timing(rise, { duration: RISE_DURATION_MS, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }).start()
    }
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    }
  }, [isReducedMotion, rise])

  const rotateY = flipProgress.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: ["0deg", "90deg", "-90deg", "0deg"] })
  const tilt = drag.interpolate({ inputRange: [-300, 0, 300], outputRange: ["-10deg", "0deg", "10deg"] })
  const riseY = rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] })
  const riseScale = rise.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] })
  const leaveX = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width * 1.2, 0, width * 1.2] })
  const leaveRotate = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-12deg", "0deg", "12deg"] })
  const leaveOpacity = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] })

  return (
    <View>
      <View style={{ height: cardHeight }}>
        <CardStackBehind count={remainingCount} />
        <Animated.View style={{ opacity: leaveOpacity, transform: [{ translateX: leaveX }, { rotate: leaveRotate }] }}>
          <Animated.View
            {...panResponder.panHandlers}
            style={{ transform: [{ translateY: riseY }, { scale: riseScale }, { translateX: drag }, { rotate: tilt }] }}
          >
            <Pressable
              accessibilityHint={isFlipped ? "表に戻します" : "めくって意味を表示します"}
              accessibilityLabel={isFlipped ? `${card.surface}。${card.meaning_ja}` : buildFrontLabel(card)}
              accessibilityLiveRegion="polite"
              accessibilityRole="button"
              onPress={flip}
            >
              <Animated.View style={{ transform: [{ perspective: 1600 }, { rotateY }] }}>
                <PaperSheet style={{ height: cardHeight }} tone={shownFlipped ? "back" : "front"}>
                  {shownFlipped ? <PaperCardBack card={card} /> : <PaperCardFront card={card} />}
                </PaperSheet>
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        {isFlipped ? (
          <>
            <View style={styles.answerRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => answer("forgot")}
                style={({ pressed }) => [styles.forgotButton, pressed && styles.forgotButtonPressed]}
              >
                <Text style={styles.forgotButtonText}>まだ</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => answer("remembered")}
                style={({ pressed }) => [styles.rememberedButton, pressed && styles.rememberedButtonPressed]}
              >
                <Text style={styles.rememberedButtonText}>覚えた</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>左右にスワイプしても答えられます（右が覚えた）</Text>
          </>
        ) : (
          <Text style={styles.hint}>意味を思い出してから、カードをタップしてめくりましょう。</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    gap: 10,
    height: 96,
    marginTop: 44,
  },
  answerRow: {
    flexDirection: "row",
    gap: 12,
  },
  forgotButton: {
    alignItems: "center",
    borderColor: "rgba(240, 140, 140, 0.6)",
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 140,
    paddingVertical: 14,
  },
  forgotButtonPressed: {
    backgroundColor: THEME_COLORS.wrongWash,
  },
  forgotButtonText: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  hint: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    textAlign: "center",
  },
  rememberedButton: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.amber,
    borderRadius: 10,
    minWidth: 140,
    paddingVertical: 14,
  },
  rememberedButtonPressed: {
    backgroundColor: THEME_COLORS.amberBright,
  },
  rememberedButtonText: {
    color: THEME_COLORS.amberInk,
    fontSize: 15,
    fontWeight: "700",
  },
})
