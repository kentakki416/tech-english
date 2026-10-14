import { memo, useEffect } from "react"
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { AttemptQuestion } from "@repo/api-schema"

import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"

/**
 * 閉じた状態のバーの高さ（下端の安全領域は別に足す）
 */
const SHEET_BAR_HEIGHT = 60

/**
 * 開いた状態の高さ（画面の高さに対する割合）
 */
const SHEET_OPEN_RATIO = 0.78

const SHEET_ANIMATION_MS = 300

const CHOICE_LETTERS = ["A", "B", "C", "D"]

/**
 * 閉じた状態のシートの高さ。画面は本文の下の余白と単語のカードの位置に使う
 */
export const calculateClosedSheetHeight = (bottomInset: number): number => SHEET_BAR_HEIGHT + bottomInset

/**
 * 設問シート。閉じた状態は下端のバー（「設問　回答 2 / 4　Q3 を開く」）、バーを押すと画面の高さの 78% まで開く（「本文に戻る」）。
 * 高さは Reanimated で 300ms かけて変える（ドラッグは要らないので @gorhom/bottom-sheet は使わない）。
 * 中身は閉じている間も描画したまま透明にして（バーの下に開いたときの高さで置き、シートの外は画面の外になる）、開閉の途中で中身が出入りしないようにする。
 * 毎秒のタイマーで画面が描き直されるので memo する（回答・設問の移動のときだけ描き直す）
 */
function QuestionSheet({
  answers,
  currentIndex,
  isOpen,
  questions,
  onChoose,
  onMove,
  onOpenSubmitConfirm,
  onToggle,
}: {
  /**
   * 設問 ID → 選んだ選択肢の添字
   */
  answers: Record<number, number>
  currentIndex: number
  isOpen: boolean
  questions: AttemptQuestion[]
  onChoose: (questionId: number, choiceIndex: number) => void
  onMove: (index: number) => void
  onOpenSubmitConfirm: () => void
  onToggle: () => void
}) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const closedHeight = calculateClosedSheetHeight(insets.bottom)
  const openHeight = Math.max(closedHeight, Math.round(windowHeight * SHEET_OPEN_RATIO))
  const progress = useSharedValue(isOpen ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, { duration: SHEET_ANIMATION_MS })
  }, [isOpen, progress])

  const sheetStyle = useAnimatedStyle(() => ({ height: closedHeight + (openHeight - closedHeight) * progress.value }))
  const bodyStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  const answeredCount = questions.filter(question => answers[question.id] !== undefined).length
  const question = questions[currentIndex]
  const isFirst = currentIndex === 0
  const isLast = currentIndex === questions.length - 1

  return (
    <Animated.View style={[styles.sheet, sheetStyle]}>
      <Pressable
        accessibilityLabel={isOpen ? "設問を閉じて本文に戻る" : `設問を開く（回答 ${answeredCount} / ${questions.length}）`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        style={styles.bar}
        onPress={onToggle}
      >
        <View style={styles.handle} />
        <Text style={styles.barTitle}>設問</Text>
        <Text style={styles.barCount}>回答 {answeredCount} / {questions.length}</Text>
        <Text style={styles.barAction}>{isOpen ? "本文に戻る" : `Q${currentIndex + 1} を開く`}</Text>
      </Pressable>

      <Animated.View
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? "auto" : "no-hide-descendants"}
        style={[styles.body, { height: openHeight - closedHeight, pointerEvents: isOpen ? "auto" : "none" }, bodyStyle]}
      >
        <View style={styles.tabs}>
          {questions.map((item, index) => {
            const isCurrent = index === currentIndex
            const isAnswered = answers[item.id] !== undefined
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={`Q${index + 1}${isAnswered ? "（回答済み）" : ""}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isCurrent }}
                style={[styles.tab, isCurrent && styles.tabActive]}
                onPress={() => onMove(index)}
              >
                <Text style={[styles.tabText, isCurrent && styles.tabTextActive]}>{index + 1}</Text>
                <View style={[styles.answeredDot, isAnswered && styles.answeredDotActive]} />
              </Pressable>
            )
          })}
        </View>

        {question && (
          <ScrollView key={question.id} contentContainerStyle={styles.questionBody} style={styles.questionScroll}>
            <Text style={styles.questionLabel}>Q{currentIndex + 1}</Text>
            <Text style={styles.prompt}>{question.prompt}</Text>
            {question.choices.map((choice, choiceIndex) => {
              const isSelected = answers[question.id] === choiceIndex
              return (
                <Pressable
                  key={choiceIndex}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  style={[styles.choice, isSelected && styles.choiceSelected]}
                  onPress={() => onChoose(question.id, choiceIndex)}
                >
                  <View style={[styles.choiceLetter, isSelected && styles.choiceLetterSelected]}>
                    <Text style={[styles.choiceLetterText, isSelected && styles.choiceLetterTextSelected]}>{CHOICE_LETTERS[choiceIndex]}</Text>
                  </View>
                  <Text style={styles.choiceText}>{choice}</Text>
                </Pressable>
              )
            })}
            <View style={styles.nav}>
              <Pressable accessibilityRole="button" disabled={isFirst} hitSlop={8} style={isFirst && styles.navDisabled} onPress={() => onMove(currentIndex - 1)}>
                <Text style={styles.navText}>前の設問</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isLast} hitSlop={8} style={isLast && styles.navDisabled} onPress={() => onMove(currentIndex + 1)}>
                <Text style={styles.navText}>次の設問</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        <View style={styles.submitArea}>
          <PrimaryButton label="提出する" onPress={onOpenSubmitConfirm} />
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const MemoizedQuestionSheet = memo(QuestionSheet)

export { MemoizedQuestionSheet as QuestionSheet }

const styles = StyleSheet.create({
  answeredDot: {
    backgroundColor: "transparent",
    borderRadius: 2,
    bottom: 4,
    height: 4,
    position: "absolute",
    width: 4,
  },
  answeredDotActive: {
    backgroundColor: THEME_COLORS.amber,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    height: SHEET_BAR_HEIGHT,
    paddingHorizontal: 18,
  },
  barAction: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    marginLeft: "auto",
  },
  barCount: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  barTitle: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  body: {
    overflow: "hidden",
  },
  choice: {
    alignItems: "flex-start",
    borderColor: THEME_COLORS.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    padding: 12,
  },
  choiceLetter: {
    alignItems: "center",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  choiceLetterSelected: {
    backgroundColor: THEME_COLORS.amber,
    borderColor: THEME_COLORS.amber,
  },
  choiceLetterText: {
    color: THEME_COLORS.fgMuted,
    fontFamily: THEME_FONTS.code,
    fontSize: 12,
  },
  choiceLetterTextSelected: {
    color: THEME_COLORS.amberInk,
  },
  choiceSelected: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.7)",
  },
  choiceText: {
    color: THEME_COLORS.fg,
    flex: 1,
    fontFamily: THEME_FONTS.reading,
    fontSize: 15.5,
    lineHeight: 22,
  },
  handle: {
    backgroundColor: THEME_COLORS.lineStrong,
    borderRadius: 2,
    height: 4,
    left: "50%",
    marginLeft: -20,
    position: "absolute",
    top: 7,
    width: 40,
  },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  navDisabled: {
    opacity: 0.4,
  },
  navText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  prompt: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 17,
    lineHeight: 26,
    marginTop: 6,
  },
  questionBody: {
    padding: 20,
  },
  questionLabel: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
  },
  questionScroll: {
    flex: 1,
  },
  sheet: {
    backgroundColor: THEME_COLORS.surface,
    borderColor: THEME_COLORS.lineStrong,
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
  submitArea: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  tab: {
    alignItems: "center",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 40,
  },
  tabActive: {
    backgroundColor: THEME_COLORS.raised,
    borderColor: THEME_COLORS.lineStrong,
    borderWidth: 1,
  },
  tabText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  tabTextActive: {
    color: THEME_COLORS.fg,
  },
  tabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    gap: 4,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
})
