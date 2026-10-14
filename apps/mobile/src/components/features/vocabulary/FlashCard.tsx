import * as Haptics from "expo-haptics"
import { useEffect, useMemo, useRef, useState } from "react"
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native"

import type { ReviewVocabularyCardRequest } from "@repo/api-schema"

import { splitDictionarySenses } from "@/components/features/passage/passage-text"
import { THEME_COLORS } from "@/const/design-theme"
import type { Pronunciation, PronunciationTarget } from "@/features/vocabulary/use-pronunciation"
import { useActiveSeconds } from "@/libs/use-active-seconds"

import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet, type VocabularyCard } from "./PaperCard"
import type { PronunciationControls } from "./PronunciationButtons"

type Grade = ReviewVocabularyCardRequest["grade"]

/**
 * ネイティブドライバは iOS / Android だけ（react-native-web は対応していない）
 */
const USE_NATIVE_DRIVER = Platform.OS !== "web"

/**
 * めくる動きの半分の時間（真横を向くまで）と、その間の速さの変わり方。web の card-flip のキーフレームの区間ごとと同じにする
 */
const FLIP_HALF_MS = 220
const FLIP_EASING = Easing.bezier(0.45, 0, 0.25, 1)

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
 * カードの読み上げのカスタムアクション（発音を鳴らす）。新アーキテクチャ（Fabric）の iOS は VoiceOver に label ではなく name を読ませるので、
 * name も日本語にする（Android の TalkBack は label を読む）
 */
const PLAY_WORD_ACTION = "発音を聞く"
const PLAY_SENTENCE_ACTION = "この文を聞く"

/**
 * 2 枚目から、カードが出たときに読み上げのフォーカスを移すまでの時間（作り直した画面の要素が読み上げに登録されるのを待つ）
 */
const FOCUS_DELAY_MS = 100

/**
 * 読み上げで伝える表の中身（何枚目か・新しい単語・語句・バッククォートを除いた本文の 1 文・出典）
 */
const buildFrontLabel = (card: VocabularyCard, positionLabel: string): string =>
  [
    positionLabel,
    card.stage === null ? "新しい単語" : null,
    card.surface,
    card.sentence ? card.sentence.text.replaceAll("`", "") : null,
    `${card.passage.title} より`,
  ].filter((item): item is string => item !== null).join("。")

/**
 * 読み上げで伝える裏の中身（意味・補足・出どころ）。辞書の意味の区切りの「/」は読点にする
 */
const buildMeaningLabel = (card: VocabularyCard): string =>
  [
    card.meaning_source === "dictionary" ? splitDictionarySenses(card.meaning_ja).join("、") : card.meaning_ja,
    card.note_ja,
    card.meaning_source === "glossary" ? "この文での意味" : "英和辞書（一般的な意味）",
  ].filter((item): item is string => item !== null).join("。")

/**
 * 1 枚分（key でカードごとに作り直す）。めくる・答える・見ていた秒数・スワイプを持つ。
 *
 * タップでめくり（横に回って真横で面を差し替える）、めくった後はボタンか左右のスワイプ（右が覚えた、左がまだ）で答える。
 * 答えると軽く振動し、カードが横に飛んでから onAnswer を呼ぶ。視差効果を減らす設定では動きを省いて切り替えだけにする。
 * 2 枚目からは、出たときに読み上げのフォーカスをカードへ移し、何枚目かを読み上げる。
 *
 * 発音（pronunciation）は 1 回分の画面で 1 つだけ持つものを受け取り、めくる・答えると止める。読み上げではカードが 1 つのボタンなので
 * （中のボタンは読み上げの要素にならない）、発音はカスタムアクション「発音を聞く」「この文を聞く」で鳴らす
 */
export function FlashCard({
  card,
  isFirst,
  isReducedMotion,
  position,
  pronunciation,
  remainingCount,
  total,
  onAnswer,
  onFlip,
}: {
  card: VocabularyCard
  /**
   * 1 回分の最初のカード（読み上げのフォーカスを動かさない）
   */
  isFirst: boolean
  isReducedMotion: boolean
  /**
   * 何枚目か（1 から）
   */
  position: number
  pronunciation: Pronunciation
  /**
   * このカードの後ろに残っている枚数（束の厚み）
   */
  remainingCount: number
  total: number
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
  const cardRef = useRef<View>(null)
  const cardHeight = Math.min(CARD_MAX_HEIGHT, Math.round(height * CARD_HEIGHT_RATIO))
  const positionLabel = `${total} 枚中 ${position} 枚目`
  const { sentence: sentenceAudio, word_url: wordUrl } = card.pronunciation

  /**
   * 答えて飛んでいく間は鳴らさない（次のカードに前のカードの再生が続かないように）
   */
  const togglePronunciation = (target: PronunciationTarget) => {
    if (isLeaving) return
    if (target === "word" && wordUrl) pronunciation.toggle("word", { url: wordUrl })
    if (target === "sentence" && sentenceAudio) {
      pronunciation.toggle("sentence", { endMs: sentenceAudio.end_ms, startMs: sentenceAudio.start_ms, url: sentenceAudio.url })
    }
  }
  const pronunciationControls: PronunciationControls = { onToggle: togglePronunciation, playing: pronunciation.playing }
  /**
   * 読み上げのカスタムアクション。音声が無いもの（単語が準備中・1 文の音声が無い）は出さない
   */
  const accessibilityActions = [
    ...(wordUrl ? [{ label: PLAY_WORD_ACTION, name: PLAY_WORD_ACTION }] : []),
    ...(card.sentence && sentenceAudio ? [{ label: PLAY_SENTENCE_ACTION, name: PLAY_SENTENCE_ACTION }] : []),
  ]

  const answer = (grade: Grade) => {
    if (!isFlipped || isLeaving) return
    pronunciation.stop()
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

  /**
   * 真横（進み具合 0.5）まで回し切ってから面を差し替え、反対側から戻す。途中でもう一度めくったら、前の動きの差し替えは取り消す
   */
  const flip = () => {
    if (isLeaving) return
    pronunciation.stop()
    const next = !isFlipped
    setIsFlipped(next)
    onFlip()
    /**
     * Android はカードの accessibilityLiveRegion が、変わったラベル（語句と意味）を読み上げる
     */
    if (next && Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions(buildMeaningLabel(card), { queue: true })
    if (isReducedMotion) {
      setShownFlipped(next)
      return
    }
    flipProgress.stopAnimation()
    flipProgress.setValue(0)
    Animated.timing(flipProgress, { duration: FLIP_HALF_MS, easing: FLIP_EASING, toValue: 0.5, useNativeDriver: USE_NATIVE_DRIVER }).start(({ finished }) => {
      if (!finished) return
      setShownFlipped(next)
      Animated.timing(flipProgress, { duration: FLIP_HALF_MS, easing: FLIP_EASING, toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }).start()
    })
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
    if (isReducedMotion) return
    Animated.timing(rise, { duration: RISE_DURATION_MS, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: USE_NATIVE_DRIVER }).start()
  }, [isReducedMotion, rise])

  /**
   * react-native-web には sendAccessibilityEvent が無いので、iOS / Android だけ
   */
  useEffect(() => {
    if (isFirst || Platform.OS === "web") return
    const timer = setTimeout(() => {
      if (cardRef.current) AccessibilityInfo.sendAccessibilityEvent(cardRef.current, "focus")
    }, FOCUS_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isFirst])

  /**
   * 見ていた秒数で毎秒描き直されるので、補間の node は作り直さない
   */
  const rotateY = useMemo(
    () => flipProgress.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: ["0deg", "90deg", "-90deg", "0deg"] }),
    [flipProgress],
  )
  const tilt = useMemo(() => drag.interpolate({ extrapolate: "clamp", inputRange: [-300, 0, 300], outputRange: ["-10deg", "0deg", "10deg"] }), [drag])
  const riseY = useMemo(() => rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }), [rise])
  const riseScale = useMemo(() => rise.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }), [rise])
  const leaveX = useMemo(() => leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width * 1.2, 0, width * 1.2] }), [leave, width])
  const leaveRotate = useMemo(() => leave.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-12deg", "0deg", "12deg"] }), [leave])
  const leaveOpacity = useMemo(() => leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }), [leave])

  return (
    <View>
      <View style={{ height: cardHeight }}>
        <CardStackBehind count={remainingCount} />
        <Animated.View style={{ opacity: leaveOpacity, transform: [{ translateX: leaveX }, { rotate: leaveRotate }] }}>
          <Animated.View
            {...panResponder.panHandlers}
            style={{ transform: [{ translateY: riseY }, { scale: riseScale }, { translateX: drag }, { rotate: tilt }] }}
          >
            {/**
              * web 表示では react-native-web が button の役割を <button> にし、中の発音のボタンと入れ子になるので役割を付けない
              */}
            <Pressable
              ref={cardRef}
              accessibilityActions={accessibilityActions}
              accessibilityHint={isFlipped ? "表に戻します" : "めくって意味を表示します"}
              accessibilityLabel={isFlipped ? `${card.surface}。${buildMeaningLabel(card)}` : buildFrontLabel(card, positionLabel)}
              accessibilityLiveRegion="polite"
              accessibilityRole={Platform.OS === "web" ? undefined : "button"}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === PLAY_WORD_ACTION) togglePronunciation("word")
                if (event.nativeEvent.actionName === PLAY_SENTENCE_ACTION) togglePronunciation("sentence")
              }}
              onPress={flip}
            >
              <Animated.View style={{ transform: [{ perspective: 1600 }, { rotateY }] }}>
                <PaperSheet style={{ height: cardHeight }} tone={shownFlipped ? "back" : "front"}>
                  {shownFlipped
                    ? <PaperCardBack card={card} pronunciation={pronunciationControls} />
                    : <PaperCardFront card={card} pronunciation={pronunciationControls} />}
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
