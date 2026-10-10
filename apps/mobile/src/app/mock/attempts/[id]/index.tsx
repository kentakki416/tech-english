import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { type Href, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { PassageReader, WordCard, type WordCardContent } from "@/components/mock/PassageReader"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import {
  formatSeconds,
  MOCK_BLOCKS,
  MOCK_DICTIONARY,
  MOCK_GLOSSARY,
  MOCK_HIDDEN_GLOSSARY_IDS,
  MOCK_PASSAGE,
  MOCK_QUESTIONS,
} from "@/libs/mock-data"

type SolvingState = "confirm" | "normal" | "overtime" | "paused" | "peek" | "sheet" | "warning"

const STATES: { href: Href, key: SolvingState, label: string }[] = [
  { href: "/mock/attempts/42", key: "normal", label: "通常" },
  { href: "/mock/attempts/42?state=peek", key: "peek", label: "長押しの和訳" },
  { href: "/mock/attempts/42?state=sheet", key: "sheet", label: "設問を開く" },
  { href: "/mock/attempts/42?state=warning", key: "warning", label: "残り 20% 未満" },
  { href: "/mock/attempts/42?state=overtime", key: "overtime", label: "時間超過" },
  { href: "/mock/attempts/42?state=paused", key: "paused", label: "一時停止" },
  { href: "/mock/attempts/42?state=confirm", key: "confirm", label: "提出確認" },
]

const INITIAL_REMAINING: Record<SolvingState, number> = {
  confirm: 96,
  normal: 252,
  overtime: -83,
  paused: 252,
  peek: 230,
  sheet: 240,
  warning: 48,
}

const CHOICE_LETTERS = ["A", "B", "C", "D"]

/**
 * 問題を解く画面（モック）
 */
export default function MockAttemptScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const initialState = STATES.find(item => item.key === params.state)?.key ?? "normal"

  const [answers, setAnswers] = useState<Record<number, number>>(initialState === "confirm" ? { 1: 1, 2: 2, 3: 1 } : { 1: 1, 2: 2 })
  const [currentIndex, setCurrentIndex] = useState(initialState === "confirm" ? 3 : 2)
  const [remaining, setRemaining] = useState(INITIAL_REMAINING[initialState])
  const [isPaused, setIsPaused] = useState(initialState === "paused")
  const [isSheetOpen, setIsSheetOpen] = useState(initialState === "sheet")
  const [isConfirmOpen, setIsConfirmOpen] = useState(initialState === "confirm")
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [peekBlock, setPeekBlock] = useState<number | null>(initialState === "peek" ? 2 : null)
  const [wordCard, setWordCard] = useState<WordCardContent | null>(null)

  const answeredCount = Object.keys(answers).length
  const unansweredCount = MOCK_QUESTIONS.length - answeredCount
  const isOvertime = remaining < 0
  const progress = Math.max(0, Math.min(1, remaining / MOCK_PASSAGE.timeLimitSeconds))
  const isWarning = !isOvertime && progress <= 0.2
  const question = MOCK_QUESTIONS[currentIndex]

  /**
   * 画面を見ている間（アプリが前面）だけタイマーを進める
   */
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused && AppState.currentState === "active") setRemaining(value => value - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [isPaused])

  const startPeek = (blockIndex: number) => {
    setPeekBlock(blockIndex)
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const toggleTranslation = (blockIndex: number) =>
    setTranslatedBlocks((value) => {
      const next = new Set(value)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable hitSlop={8} onPress={() => router.replace("/mock/passages")} style={styles.backButton}>
          <Ionicons color={MOCK_COLORS.fgMuted} name="chevron-back" size={18} />
          <Text style={styles.backText}>中断</Text>
        </Pressable>
        <View style={styles.timer}>
          <Text style={styles.timerLabel}>{isOvertime ? "超過" : "残り"}</Text>
          <Text style={[styles.timerValue, isOvertime ? { color: MOCK_COLORS.wrong } : isWarning ? { color: MOCK_COLORS.amber } : null]}>
            {isOvertime ? `+${formatSeconds(-remaining)}` : formatSeconds(remaining)}
          </Text>
        </View>
        <Pressable
          accessibilityState={{ selected: showAllTranslations }}
          onPress={() => setShowAllTranslations(value => !value)}
          style={[styles.toolButton, showAllTranslations && styles.toolButtonActive]}
        >
          <Text style={[styles.toolText, showAllTranslations && { color: MOCK_COLORS.amber }]}>全文訳</Text>
        </Pressable>
        <Pressable accessibilityLabel={isPaused ? "再開する" : "一時停止"} onPress={() => setIsPaused(value => !value)} style={styles.iconButton}>
          <Ionicons color={MOCK_COLORS.fgMuted} name={isPaused ? "play" : "pause"} size={14} />
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            isOvertime
              ? { backgroundColor: MOCK_COLORS.wrong, width: "100%" }
              : { backgroundColor: isWarning ? MOCK_COLORS.amberBright : "rgba(243, 178, 76, 0.7)", width: `${progress * 100}%` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <PassageReader
          blocks={MOCK_BLOCKS}
          dictionary={MOCK_DICTIONARY}
          glossary={MOCK_GLOSSARY}
          hiddenGlossaryIds={MOCK_HIDDEN_GLOSSARY_IDS}
          peekBlock={peekBlock}
          showAllTranslations={showAllTranslations}
          translatedBlocks={translatedBlocks}
          onPeekEnd={() => setPeekBlock(null)}
          onPeekStart={startPeek}
          onToggleTranslation={toggleTranslation}
          onWordPress={setWordCard}
        />
        <Text style={styles.attribution}>出典：{MOCK_PASSAGE.sourceName}（{MOCK_PASSAGE.license}）。一部を抜粋・改変しています。</Text>
        <Text style={styles.hint}>段落を長押しすると、押している間だけ和訳を表示します。</Text>
      </ScrollView>

      {wordCard && (
        <View style={styles.wordCardWrapper}>
          <WordCard content={wordCard} onClose={() => setWordCard(null)} />
        </View>
      )}

      <SafeAreaView edges={["bottom"]} style={[styles.sheet, isSheetOpen && styles.sheetOpen]}>
        <Pressable onPress={() => setIsSheetOpen(value => !value)} style={styles.sheetBar}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>設問</Text>
          <Text style={styles.sheetCount}>回答 {answeredCount} / {MOCK_QUESTIONS.length}</Text>
          <Text style={styles.sheetAction}>{isSheetOpen ? "本文に戻る" : `Q${currentIndex + 1} を開く`}</Text>
        </Pressable>
        {isSheetOpen && (
          <View style={{ flex: 1 }}>
            <View style={styles.questionTabs}>
              {MOCK_QUESTIONS.map((item, index) => (
                <Pressable key={item.id} onPress={() => setCurrentIndex(index)} style={[styles.questionTab, index === currentIndex && styles.questionTabActive]}>
                  <Text style={[styles.questionTabText, index === currentIndex && { color: MOCK_COLORS.fg }]}>{index + 1}</Text>
                  <View style={[styles.answeredDot, answers[item.id] !== undefined && { backgroundColor: MOCK_COLORS.amber }]} />
                </Pressable>
              ))}
            </View>
            <ScrollView contentContainerStyle={styles.questionBody}>
              <Text style={styles.questionLabel}>Q{currentIndex + 1}</Text>
              <Text style={styles.prompt}>{question.prompt}</Text>
              {question.choices.map((choice, choiceIndex) => {
                const isSelected = answers[question.id] === choiceIndex
                return (
                  <Pressable
                    key={choiceIndex}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setAnswers(value => ({ ...value, [question.id]: choiceIndex }))}
                    style={[styles.choice, isSelected && styles.choiceSelected]}
                  >
                    <View style={[styles.choiceLetter, isSelected && styles.choiceLetterSelected]}>
                      <Text style={[styles.choiceLetterText, isSelected && { color: MOCK_COLORS.amberInk }]}>{CHOICE_LETTERS[choiceIndex]}</Text>
                    </View>
                    <Text style={styles.choiceText}>{choice}</Text>
                  </Pressable>
                )
              })}
              <View style={styles.questionNav}>
                <Pressable disabled={currentIndex === 0} onPress={() => setCurrentIndex(value => value - 1)} style={{ opacity: currentIndex === 0 ? 0.4 : 1 }}>
                  <Text style={styles.navText}>前の設問</Text>
                </Pressable>
                <Pressable
                  disabled={currentIndex === MOCK_QUESTIONS.length - 1}
                  onPress={() => setCurrentIndex(value => value + 1)}
                  style={{ opacity: currentIndex === MOCK_QUESTIONS.length - 1 ? 0.4 : 1 }}
                >
                  <Text style={styles.navText}>次の設問</Text>
                </Pressable>
              </View>
            </ScrollView>
            <View style={styles.submitArea}>
              <Pressable onPress={() => setIsConfirmOpen(true)} style={styles.submitButton}>
                <Text style={styles.submitText}>提出する</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      {isPaused && (
        <View style={styles.pauseOverlay}>
          <View style={styles.pauseLamp} />
          <Text style={styles.pauseTitle}>一時停止中</Text>
          <Text style={styles.pauseText}>本文と設問を隠しています。再開するとタイマーが動きます。</Text>
          <Pressable onPress={() => setIsPaused(false)} style={[styles.submitButton, { marginTop: 24, paddingHorizontal: 28 }]}>
            <Text style={styles.submitText}>再開する</Text>
          </Pressable>
        </View>
      )}

      <Modal animationType="fade" onRequestClose={() => setIsConfirmOpen(false)} transparent visible={isConfirmOpen}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{unansweredCount > 0 ? `未回答の設問が ${unansweredCount} 問あります` : "回答を提出しますか？"}</Text>
            <Text style={styles.dialogText}>{unansweredCount > 0 ? "未回答の設問は不正解として採点されます。" : ""}提出すると回答は変更できません。</Text>
            <Pressable
              onPress={() => {
                setIsConfirmOpen(false)
                router.replace("/mock/attempts/42/result")
              }}
              style={[styles.submitButton, { marginTop: 20 }]}
            >
              <Text style={styles.submitText}>提出する</Text>
            </Pressable>
            <Pressable onPress={() => setIsConfirmOpen(false)} style={styles.dialogCancel}>
              <Text style={styles.dialogCancelText}>{unansweredCount > 0 ? "戻って回答する" : "戻る"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <MockStatePanel bottom={isSheetOpen ? 690 : 84} current={initialState} states={STATES} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  answeredDot: {
    backgroundColor: "transparent",
    borderRadius: 2,
    bottom: 4,
    height: 4,
    position: "absolute",
    width: 4,
  },
  attribution: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 40,
    marginTop: 16,
    paddingTop: 12,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    paddingVertical: 6,
  },
  backText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  choice: {
    alignItems: "flex-start",
    borderColor: MOCK_COLORS.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    padding: 12,
  },
  choiceLetter: {
    alignItems: "center",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  choiceLetterSelected: {
    backgroundColor: MOCK_COLORS.amber,
    borderColor: MOCK_COLORS.amber,
  },
  choiceLetterText: {
    color: MOCK_COLORS.fgMuted,
    fontFamily: MOCK_FONTS.code,
    fontSize: 12,
  },
  choiceSelected: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.7)",
  },
  choiceText: {
    color: MOCK_COLORS.fg,
    flex: 1,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 15.5,
    lineHeight: 22,
  },
  content: {
    paddingBottom: 120,
    paddingLeft: 4,
    paddingRight: 20,
    paddingTop: 24,
  },
  dialog: {
    backgroundColor: MOCK_COLORS.raised,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    padding: 22,
    width: "100%",
  },
  dialogBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  dialogCancel: {
    alignItems: "center",
    paddingVertical: 14,
  },
  dialogCancelText: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
  },
  dialogText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  dialogTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    marginLeft: 40,
    marginTop: 6,
  },
  iconButton: {
    alignItems: "center",
    borderColor: MOCK_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  navText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  pauseLamp: {
    backgroundColor: MOCK_COLORS.heat0,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  pauseOverlay: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.canvas,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 32,
    position: "absolute",
    right: 0,
    top: 58,
    zIndex: 40,
  },
  pauseText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center",
  },
  pauseTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 18,
  },
  progressFill: {
    height: 2,
  },
  progressTrack: {
    backgroundColor: MOCK_COLORS.line,
    height: 2,
  },
  prompt: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 17,
    lineHeight: 26,
    marginTop: 6,
  },
  questionBody: {
    padding: 20,
  },
  questionLabel: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  questionNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  questionTab: {
    alignItems: "center",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 40,
  },
  questionTabActive: {
    backgroundColor: MOCK_COLORS.raised,
    borderColor: MOCK_COLORS.lineStrong,
    borderWidth: 1,
  },
  questionTabText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  questionTabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    gap: 4,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  screen: {
    backgroundColor: MOCK_COLORS.canvas,
    flex: 1,
  },
  sheet: {
    backgroundColor: MOCK_COLORS.surface,
    borderColor: MOCK_COLORS.lineStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { height: -10, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    zIndex: 30,
  },
  sheetAction: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    marginLeft: "auto",
  },
  sheetBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    height: 60,
    paddingHorizontal: 18,
  },
  sheetCount: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  sheetHandle: {
    backgroundColor: MOCK_COLORS.lineStrong,
    borderRadius: 2,
    height: 4,
    left: "50%",
    marginLeft: -20,
    position: "absolute",
    top: 7,
    width: 40,
  },
  sheetOpen: {
    height: "78%",
  },
  sheetTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  submitArea: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
  },
  submitText: {
    color: MOCK_COLORS.amberInk,
    fontSize: 15,
    fontWeight: "700",
  },
  timer: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 5,
    marginLeft: "auto",
  },
  timerLabel: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 11,
  },
  timerValue: {
    color: MOCK_COLORS.fg,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  toolButton: {
    borderColor: MOCK_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  toolButtonActive: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  toolText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    height: 56,
    paddingHorizontal: 14,
  },
  wordCardWrapper: {
    bottom: 76,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 35,
  },
})
