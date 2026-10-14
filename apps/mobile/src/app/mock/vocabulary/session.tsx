import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { type Href, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { CardStackBehind, PaperCardBack, PaperCardFront, PaperSheet } from "@/components/mock/PaperCard"
import { mockStyles, PrimaryButton, SecondaryButton } from "@/components/mock/parts"
import { useFlipSound } from "@/components/mock/use-flip-sound"
import { MOCK_COLORS } from "@/const/mock-theme"
import { MOCK_VOCABULARY_CARDS, MOCK_VOCABULARY_SUMMARY, type MockVocabularyCard } from "@/libs/mock-data"

type MockState = "back" | "done" | "front" | "review" | "save_failed"

type Grade = "forgot" | "remembered"

const STATES: { href: Href, key: MockState, label: string }[] = [
  { href: "/mock/vocabulary/session", key: "front", label: "表" },
  { href: "/mock/vocabulary/session?state=back", key: "back", label: "めくった後" },
  { href: "/mock/vocabulary/session?state=review", key: "review", label: "ふりかえり" },
  { href: "/mock/vocabulary/session?state=save_failed", key: "save_failed", label: "保存できなかった" },
  { href: "/mock/vocabulary/session?state=done", key: "done", label: "今日の分が終わった" },
]

/**
 * ふりかえりの状態で使う答え（覚えた 7 / まだ 3）
 */
const REVIEWED_GRADES: Grade[] = ["remembered", "forgot", "remembered", "remembered", "forgot", "remembered", "remembered", "remembered", "forgot", "remembered"]

/**
 * めくる時間と、面を差し替える時刻（カードが真横を向いた瞬間）。web と同じ
 */
const FLIP_DURATION_MS = 440
const FLIP_HALF_MS = 220

/**
 * 答えたカードが横に飛んでいく時間
 */
const LEAVE_DURATION_MS = 280

/**
 * これより横に動かして離したら答えとみなす（画面幅に対する割合）
 */
const SWIPE_THRESHOLD_RATIO = 0.3

const CARD_HEIGHT = 420

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[value.getUTCDay()]}）`
}

/**
 * 進み具合のマス。覚えたは琥珀、まだはローズの枠、今のカードは白い輪
 */
function ProgressSquares({ answers, total }: { answers: Grade[], total: number }) {
  return (
    <View style={styles.squares}>
      {Array.from({ length: total }, (_, index) => {
        const grade = answers[index]
        return (
          <View
            key={index}
            style={[
              styles.square,
              grade === "remembered" && styles.squareRemembered,
              grade === "forgot" && styles.squareForgot,
              grade === undefined && index === answers.length && styles.squareCurrent,
            ]}
          />
        )
      })}
    </View>
  )
}

/**
 * 1 枚のカード。タップでめくり（横に回って真横で面を差し替える）、めくった後は左右にスワイプして答える。
 * key で 1 枚ごとに作り直し、束から上がってくる動きを付ける
 */
function FlipCard({
  card,
  isFlipped,
  isReducedMotion,
  onAnswer,
  onFlip,
  swipeThreshold,
}: {
  card: MockVocabularyCard
  isFlipped: boolean
  isReducedMotion: boolean
  onAnswer: (grade: Grade) => void
  onFlip: () => void
  swipeThreshold: number
}) {
  const [shownFlipped, setShownFlipped] = useState(isFlipped)
  const flipProgress = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current
  const drag = useRef(new Animated.Value(0)).current
  const latest = useRef({ isFlipped, onAnswer })
  latest.current = { isFlipped, onAnswer }

  useEffect(() => {
    Animated.timing(rise, { duration: 280, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: Platform.OS !== "web" }).start()
  }, [rise])

  const flip = () => {
    onFlip()
    const next = !isFlipped
    if (isReducedMotion) {
      setShownFlipped(next)
      return
    }
    flipProgress.setValue(0)
    Animated.timing(flipProgress, { duration: FLIP_DURATION_MS, easing: Easing.bezier(0.45, 0, 0.25, 1), toValue: 1, useNativeDriver: Platform.OS !== "web" }).start()
    setTimeout(() => setShownFlipped(next), FLIP_HALF_MS)
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => latest.current.isFlipped && Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => drag.setValue(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < swipeThreshold) {
          Animated.spring(drag, { friction: 6, toValue: 0, useNativeDriver: Platform.OS !== "web" }).start()
          return
        }
        latest.current.onAnswer(gesture.dx > 0 ? "remembered" : "forgot")
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start(),
    }),
  ).current

  const rotateY = flipProgress.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: ["0deg", "90deg", "-90deg", "0deg"] })
  const tilt = drag.interpolate({ inputRange: [-300, 0, 300], outputRange: ["-10deg", "0deg", "10deg"] })
  const riseY = rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] })
  const riseScale = rise.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] })

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{ transform: [{ translateY: riseY }, { scale: riseScale }, { translateX: drag }, { rotate: tilt }] }}
    >
      <Pressable accessibilityHint={isFlipped ? "表に戻します" : "意味を表示します"} accessibilityLabel="カード" accessibilityRole="button" onPress={flip}>
        <Animated.View style={{ transform: [{ perspective: 1600 }, { rotateY }] }}>
          <PaperSheet style={{ height: CARD_HEIGHT }} tone={shownFlipped ? "back" : "front"}>
            {shownFlipped ? <PaperCardBack card={card} /> : <PaperCardFront card={card} />}
          </PaperSheet>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

/**
 * ふりかえり。覚えた / まだの数と、まだの単語の一覧
 */
function SessionReview({ answers, cards, hasSaveFailure, onRetry }: { answers: Grade[], cards: MockVocabularyCard[], hasSaveFailure: boolean, onRetry: () => void }) {
  const router = useRouter()
  const rememberedCount = answers.filter(grade => grade === "remembered").length
  const forgotCards = cards.filter((_, index) => answers[index] === "forgot")

  return (
    <View style={styles.review}>
      <Text style={styles.reviewTitle}>ふりかえり</Text>
      <Text style={styles.reviewScore}>
        <Text style={mockStyles.caption}>覚えた  </Text>
        <Text style={styles.reviewRemembered}>{rememberedCount}</Text>
        <Text style={styles.reviewSlash}>  /  </Text>
        <Text style={styles.reviewForgot}>{answers.length - rememberedCount}</Text>
        <Text style={mockStyles.caption}>  まだ</Text>
      </Text>
      <View style={styles.reviewSquares}><ProgressSquares answers={answers} total={answers.length} /></View>

      {hasSaveFailure && (
        <View style={styles.failure}>
          <Text style={styles.failureText}>保存できなかったカードが 1 枚あります。</Text>
          <Pressable accessibilityRole="button" style={styles.failureButton}>
            <Text style={styles.failureText}>もう一度送る</Text>
          </Pressable>
        </View>
      )}

      {forgotCards.length > 0 && (
        <View style={styles.forgotSection}>
          <Text style={mockStyles.sectionTitle}>まだの単語</Text>
          <Text style={[mockStyles.caption, styles.forgotLead]}>明日、もう一度出ます。</Text>
          {forgotCards.map(card => (
            <View key={card.lemma} style={styles.forgotRow}>
              <Text style={styles.forgotSurface}>{card.surface}</Text>
              <Text style={styles.forgotMeaning}>{card.meaningJa}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.reviewActions}>
        <PrimaryButton label="もう 1 回" onPress={onRetry} />
        <SecondaryButton label="単語帳のトップへ" onPress={() => router.back()} />
      </View>
    </View>
  )
}

/**
 * 今日の分が無いとき
 */
function SessionDone() {
  const router = useRouter()
  return (
    <View style={styles.done}>
      <View style={styles.doneDeck}>
        <CardStackBehind count={2} />
        <PaperSheet style={styles.doneCard}>
          <View style={styles.doneCardBody}><Text style={styles.doneCardText}>All done.</Text></View>
        </PaperSheet>
      </View>
      <Text style={styles.doneTitle}>今日の分は終わりました</Text>
      <Text style={styles.doneLead}>次の復習は {formatDayLabel(MOCK_VOCABULARY_SUMMARY.nextDueDate)} です。問題を解くと、新しい単語が増えます。</Text>
      <View style={styles.reviewActions}>
        <PrimaryButton label="問題を解く" onPress={() => router.push("/mock/passages")} />
        <SecondaryButton label="単語帳のトップへ" onPress={() => router.back()} />
      </View>
    </View>
  )
}

/**
 * 単語帳の 1 回分（モック）。スタックの全画面
 *
 * カードをタップしてめくり、めくった後はボタンか左右のスワイプ（右が覚えた、左がまだ）で答える。
 * 答えると軽く振動し、カードが横に飛んで次のカードが束から上がってくる。めくるたびに紙の音を鳴らす（上部バーで消せる）
 */
export default function MockVocabularySessionScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const state = STATES.find(item => item.key === params.state)?.key ?? "front"
  const cards = state === "done" ? [] : MOCK_VOCABULARY_CARDS
  const isReviewState = state === "review" || state === "save_failed"
  const [answers, setAnswers] = useState<Grade[]>(isReviewState ? REVIEWED_GRADES : ["remembered", "forgot"])
  const [isFlipped, setIsFlipped] = useState(state === "back")
  const [isLeaving, setIsLeaving] = useState(false)
  const leave = useRef(new Animated.Value(0)).current
  const isReducedMotion = useReducedMotion()
  const sound = useFlipSound()
  const { width } = useWindowDimensions()
  const current = cards[answers.length]

  const flip = () => {
    if (isLeaving) return
    sound.play()
    setIsFlipped(value => !value)
  }

  const answer = (grade: Grade) => {
    if (!isFlipped || isLeaving) return
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const finish = () => {
      setAnswers(previous => [...previous, grade])
      setIsFlipped(false)
      setIsLeaving(false)
      leave.setValue(0)
    }
    if (isReducedMotion) {
      finish()
      return
    }
    setIsLeaving(true)
    Animated.timing(leave, { duration: LEAVE_DURATION_MS, easing: Easing.out(Easing.quad), toValue: grade === "remembered" ? 1 : -1, useNativeDriver: Platform.OS !== "web" }).start(finish)
  }

  const retry = () => {
    setAnswers([])
    setIsFlipped(false)
  }

  const leaveX = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width * 1.2, 0, width * 1.2] })
  const leaveRotate = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-12deg", "0deg", "12deg"] })
  const leaveOpacity = leave.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] })

  return (
    <SafeAreaView edges={["top", "bottom"]} style={mockStyles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.topSide}>
          <Text style={styles.back}>‹ 単語帳</Text>
        </Pressable>
        {cards.length > 0 && (
          <Text style={styles.count}>
            {Math.min(answers.length + 1, cards.length)}
            <Text style={styles.countTotal}> / {cards.length}</Text>
          </Text>
        )}
        <Pressable
          accessibilityLabel={sound.isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
          accessibilityRole="button"
          hitSlop={8}
          onPress={sound.toggle}
          style={[styles.topSide, styles.topSideRight]}
        >
          <Ionicons color={MOCK_COLORS.fgMuted} name={sound.isEnabled ? "volume-high-outline" : "volume-mute-outline"} size={20} />
        </Pressable>
      </View>
      {cards.length > 0 && current && <View style={styles.progress}><ProgressSquares answers={answers} total={cards.length} /></View>}

      <View style={styles.body}>
        {cards.length === 0 ? (
          <SessionDone />
        ) : !current ? (
          <SessionReview answers={answers} cards={cards} hasSaveFailure={state === "save_failed"} onRetry={retry} />
        ) : (
          <>
            <View style={styles.stage}>
              <CardStackBehind count={cards.length - answers.length - 1} />
              <Animated.View style={{ opacity: leaveOpacity, transform: [{ translateX: leaveX }, { rotate: leaveRotate }] }}>
                <FlipCard
                  key={answers.length}
                  card={current}
                  isFlipped={isFlipped}
                  isReducedMotion={isReducedMotion}
                  onAnswer={answer}
                  onFlip={flip}
                  swipeThreshold={width * SWIPE_THRESHOLD_RATIO}
                />
              </Animated.View>
            </View>

            <View style={styles.actions}>
              {isFlipped ? (
                <>
                  <View style={styles.answerRow}>
                    <Pressable accessibilityRole="button" onPress={() => answer("forgot")} style={({ pressed }) => [styles.forgotButton, pressed && { backgroundColor: MOCK_COLORS.wrongWash }]}>
                      <Text style={styles.forgotButtonText}>まだ</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => answer("remembered")} style={({ pressed }) => [styles.rememberedButton, pressed && { backgroundColor: MOCK_COLORS.amberBright }]}>
                      <Text style={styles.rememberedButtonText}>覚えた</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.hint}>左右にスワイプしても答えられます（右が覚えた）</Text>
                </>
              ) : (
                <Text style={styles.hint}>意味を思い出してから、カードをタップしてめくりましょう。</Text>
              )}
            </View>
          </>
        )}
      </View>
      <MockStatePanel bottom={24} current={state} states={STATES} />
    </SafeAreaView>
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
  back: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 15,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  count: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  countTotal: {
    color: MOCK_COLORS.fgFaint,
  },
  done: {
    alignItems: "center",
    gap: 10,
  },
  doneCard: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  doneCardBody: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  doneCardText: {
    color: MOCK_COLORS.inkMuted,
    fontSize: 18,
    fontStyle: "italic",
  },
  doneDeck: {
    height: 140,
    marginBottom: 24,
    width: 220,
  },
  doneLead: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  doneTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
  },
  failure: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.5)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  failureButton: {
    borderColor: "rgba(240, 140, 140, 0.6)",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  failureText: {
    color: MOCK_COLORS.fg,
    fontSize: 13,
  },
  forgotButton: {
    alignItems: "center",
    borderColor: "rgba(240, 140, 140, 0.6)",
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 140,
    paddingVertical: 14,
  },
  forgotButtonText: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
  },
  forgotLead: {
    marginBottom: 6,
    marginTop: 2,
  },
  forgotMeaning: {
    color: MOCK_COLORS.fgMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  forgotRow: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  forgotSection: {
    marginTop: 28,
  },
  forgotSurface: {
    color: MOCK_COLORS.fg,
    fontFamily: "Literata_400Regular",
    fontSize: 16,
    width: 120,
  },
  hint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
    textAlign: "center",
  },
  progress: {
    alignItems: "center",
    paddingTop: 4,
  },
  rememberedButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 10,
    minWidth: 140,
    paddingVertical: 14,
  },
  rememberedButtonText: {
    color: MOCK_COLORS.amberInk,
    fontSize: 15,
    fontWeight: "700",
  },
  review: {
    paddingVertical: 16,
  },
  reviewActions: {
    gap: 10,
    marginTop: 28,
    width: "100%",
  },
  reviewForgot: {
    color: MOCK_COLORS.fg,
    fontSize: 36,
    fontWeight: "700",
  },
  reviewRemembered: {
    color: MOCK_COLORS.amber,
    fontSize: 36,
    fontWeight: "700",
  },
  reviewScore: {
    marginTop: 8,
    textAlign: "center",
  },
  reviewSlash: {
    color: MOCK_COLORS.fgFaint,
  },
  reviewSquares: {
    alignItems: "center",
    marginTop: 12,
  },
  reviewTitle: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    textAlign: "center",
  },
  square: {
    backgroundColor: MOCK_COLORS.heat0,
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  squareCurrent: {
    borderColor: "rgba(221, 226, 234, 0.6)",
    borderWidth: 1,
  },
  squareForgot: {
    backgroundColor: MOCK_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.7)",
    borderWidth: 1,
  },
  squareRemembered: {
    backgroundColor: MOCK_COLORS.amber,
    shadowColor: MOCK_COLORS.amber,
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  squares: {
    flexDirection: "row",
    gap: 4,
  },
  stage: {
    height: CARD_HEIGHT,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  topSide: {
    width: 88,
  },
  topSideRight: {
    alignItems: "flex-end",
  },
})
