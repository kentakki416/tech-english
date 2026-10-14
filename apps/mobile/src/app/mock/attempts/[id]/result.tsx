import { Ionicons } from "@expo/vector-icons"
import { type Href, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { mockStyles, PrimaryButton, ScoreSquares, SecondaryButton, SourceMeta } from "@/components/mock/parts"
import { PassageReader, WordCard, type WordCardContent } from "@/components/mock/PassageReader"
import { ReadAloudBar, ReturnToReadingButton, useReadAloudMock } from "@/components/mock/ReadAloud"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import {
  formatSeconds,
  MOCK_BLOCKS,
  MOCK_DICTIONARY,
  MOCK_GLOSSARY,
  MOCK_PASSAGE,
  MOCK_QUESTIONS,
  MOCK_RESULT,
  MOCK_SUBMITTED_ANSWERS,
  QUESTION_TYPE_LABELS,
} from "@/libs/mock-data"

const STATES: { href: Href, key: string, label: string }[] = [
  { href: "/mock/attempts/42/result", key: "normal", label: "時間内" },
  { href: "/mock/attempts/42/result?state=overtime", key: "overtime", label: "時間超過" },
]

const CHOICE_LETTERS = ["A", "B", "C", "D"]

/**
 * 結果・解説（モック）。スコアと時間 → 設問ごとの結果 → 調べた単語 → 出典 → 本文、の順に縦に並べる
 */
export default function MockResultScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const isOvertimeState = params.state === "overtime"
  const elapsedSeconds = isOvertimeState ? 402 : MOCK_RESULT.elapsedSeconds

  const scrollRef = useRef<ScrollView>(null)
  const passageY = useRef(0)
  const blockY = useRef<Record<number, number>>({})

  const results = MOCK_QUESTIONS.map(question => MOCK_SUBMITTED_ANSWERS[question.id] === question.correctChoiceIndex)
  const firstWrong = MOCK_QUESTIONS.find(question => MOCK_SUBMITTED_ANSWERS[question.id] !== question.correctChoiceIndex)
  const [openIds, setOpenIds] = useState<Set<number>>(new Set(firstWrong ? [firstWrong.id] : []))
  const [highlightId, setHighlightId] = useState<number | null>(firstWrong?.id ?? null)
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [wordCard, setWordCard] = useState<WordCardContent | null>(null)
  const [isFollowing, setIsFollowing] = useState(true)
  const readAloud = useReadAloudMock({ blocks: MOCK_BLOCKS, glossary: MOCK_GLOSSARY })
  const readingBlockIndex = readAloud.state.blockIndex
  const isReading = readingBlockIndex !== null

  /**
   * 読み上げ中の段落が変わったら、その段落が見える位置までスクロールする（自動スクロールを止めていない間だけ）
   */
  useEffect(() => {
    if (readingBlockIndex === null || !isFollowing) return
    scrollRef.current?.scrollTo({ animated: true, y: passageY.current + (blockY.current[readingBlockIndex] ?? 0) - 120 })
  }, [isFollowing, readingBlockIndex])

  const highlight = MOCK_QUESTIONS.find(question => question.id === highlightId)?.evidence ?? null
  const isOvertime = elapsedSeconds > MOCK_PASSAGE.timeLimitSeconds
  const wpm = Math.round(MOCK_PASSAGE.wordCount / (elapsedSeconds / 60))
  const timeRatio = Math.min(elapsedSeconds / MOCK_PASSAGE.timeLimitSeconds, 1.25) / 1.25

  const showEvidence = (questionId: number, blockIndex: number) => {
    setHighlightId(questionId)
    scrollRef.current?.scrollTo({ animated: true, y: passageY.current + (blockY.current[blockIndex] ?? 0) - 80 })
  }

  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.topBar}>
        <Pressable hitSlop={8} onPress={() => router.replace("/mock/passages")} style={styles.backButton}>
          <Ionicons color={MOCK_COLORS.fgMuted} name="chevron-back" size={18} />
          <Text style={styles.backText}>問題一覧</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/mock/home")}>
          <Text style={styles.backText}>マイページへ</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 190 }}
        onScrollBeginDrag={() => {
          if (isReading) setIsFollowing(false)
        }}
        ref={scrollRef}
      >
        <View style={styles.summary}>
          <Text numberOfLines={1} style={styles.passageTitle}>{MOCK_PASSAGE.title}</Text>
          <View style={{ marginTop: 16 }}>
            <ScoreSquares isAnimated results={results} size={36} />
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>{results.filter(Boolean).length} / {results.length}</Text>
            <Text style={mockStyles.caption}>問正解</Text>
          </View>

          <Text style={[mockStyles.caption, { marginTop: 20 }]}>かかった時間</Text>
          <View style={styles.timeRow}>
            <Text style={styles.metric}>{formatSeconds(elapsedSeconds)}</Text>
            <Text style={mockStyles.caption}>／ 制限 {formatSeconds(MOCK_PASSAGE.timeLimitSeconds)}</Text>
            {isOvertime && <Text style={styles.overtimeBadge}>{formatSeconds(elapsedSeconds - MOCK_PASSAGE.timeLimitSeconds)} 超過</Text>}
          </View>
          <View style={styles.timeTrack}>
            <View style={[styles.timeFill, { backgroundColor: isOvertime ? MOCK_COLORS.wrong : MOCK_COLORS.amber, width: `${timeRatio * 100}%` }]} />
            <View style={styles.timeLimitMark} />
          </View>

          <View style={styles.metricsRow}>
            <View style={{ flex: 1 }}>
              <Text style={mockStyles.caption}>読む速さ</Text>
              <Text style={styles.metricSmall}>{wpm} WPM</Text>
              <Text style={styles.faint}>設問を解く時間を含む</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={mockStyles.caption}>アシストの使用</Text>
              <Text style={styles.metricSmall}>和訳 {MOCK_RESULT.translatedBlockCount} 段落</Text>
              <Text style={styles.metricSmall}>単語 {MOCK_RESULT.wordLookups.length} 回</Text>
              <Text style={styles.metricSmall}>読み上げ 2 段落</Text>
            </View>
          </View>
        </View>

        {MOCK_QUESTIONS.map((question, index) => {
          const userChoice = MOCK_SUBMITTED_ANSWERS[question.id]
          const isCorrect = userChoice === question.correctChoiceIndex
          const isOpen = openIds.has(question.id)
          return (
            <View key={question.id} style={styles.question}>
              <Pressable
                onPress={() => setOpenIds((value) => {
                  const next = new Set(value)
                  if (next.has(question.id)) next.delete(question.id)
                  else next.add(question.id)
                  return next
                })}
                style={styles.questionHeader}
              >
                <View style={[styles.square, isCorrect ? { backgroundColor: MOCK_COLORS.correct } : styles.squareWrong]} />
                <Text style={styles.questionNumber}>Q{index + 1}</Text>
                <Text style={styles.typeBadge}>{QUESTION_TYPE_LABELS[question.type]}</Text>
                <Text style={{ color: isCorrect ? MOCK_COLORS.correct : MOCK_COLORS.wrong, fontSize: 14 }}>{isCorrect ? "正解" : "不正解"}</Text>
                <Ionicons color={MOCK_COLORS.fgFaint} name={isOpen ? "chevron-up" : "chevron-down"} size={16} style={{ marginLeft: "auto" }} />
              </Pressable>
              {isOpen && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.prompt}>{question.prompt}</Text>
                  {question.choices.map((choice, choiceIndex) => {
                    const isCorrectChoice = choiceIndex === question.correctChoiceIndex
                    const isUserChoice = choiceIndex === userChoice
                    return (
                      <View
                        key={choiceIndex}
                        style={[styles.choice, isCorrectChoice && styles.choiceCorrect, isUserChoice && !isCorrectChoice && styles.choiceWrong]}
                      >
                        <Text style={[styles.choiceLetter, isCorrectChoice && styles.choiceLetterCorrect, isUserChoice && !isCorrectChoice && styles.choiceLetterWrong]}>
                          {CHOICE_LETTERS[choiceIndex]}
                        </Text>
                        <Text style={[styles.choiceText, !isCorrectChoice && !isUserChoice && { color: MOCK_COLORS.fgMuted }]}>{choice}</Text>
                        <View style={{ alignItems: "flex-end" }}>
                          {isCorrectChoice && <Text style={{ color: MOCK_COLORS.correct, fontSize: 11 }}>正解</Text>}
                          {isUserChoice && <Text style={{ color: isCorrectChoice ? MOCK_COLORS.correct : MOCK_COLORS.wrong, fontSize: 11 }}>あなたの回答</Text>}
                        </View>
                      </View>
                    )
                  })}
                  <Text style={styles.explanation}>{question.explanationJa}</Text>
                  <Pressable
                    onPress={() => showEvidence(question.id, question.evidence.blockIndex)}
                    style={[styles.evidenceButton, highlightId === question.id && styles.evidenceButtonActive]}
                  >
                    <Text style={{ color: highlightId === question.id ? MOCK_COLORS.amber : MOCK_COLORS.fgMuted, fontSize: 12 }}>
                      {highlightId === question.id ? "● 本文で根拠を表示中" : "● 本文の根拠を見る"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )
        })}

        <View style={styles.section}>
          <View style={styles.lookupHeader}>
            <Text style={mockStyles.sectionTitle}>調べた単語</Text>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.dismissTo("/mock/vocabulary")}>
              <Text style={styles.lookupLink}>単語帳で復習する</Text>
            </Pressable>
          </View>
          {MOCK_RESULT.wordLookups.map(lookup => (
            <View key={lookup.surface} style={styles.lookupRow}>
              <Text style={styles.lookupSurface}>{lookup.surface}</Text>
              <Text style={styles.lookupMeaning}>{lookup.meaningJa}</Text>
              <Text style={{ color: lookup.source === "glossary" ? MOCK_COLORS.amber : MOCK_COLORS.fgFaint, fontSize: 11 }}>
                {lookup.source === "glossary" ? "文脈" : "辞書"}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={mockStyles.sectionTitle}>出典</Text>
          <View style={{ marginTop: 8 }}><SourceMeta kind={MOCK_PASSAGE.kind} name={MOCK_PASSAGE.sourceName} /></View>
          <Text style={styles.attribution}>react.dev/learn/synchronizing-with-effects</Text>
          <Text style={styles.attribution}>取得時点：コミット 3f9c2a1　ライセンス：{MOCK_PASSAGE.license}</Text>
          <Text style={styles.faint}>一部を抜粋・改変しています。</Text>
        </View>

        <View
          onLayout={(event) => {
            passageY.current = event.nativeEvent.layout.y
          }}
          style={styles.passage}
        >
          <Text style={[mockStyles.caption, { marginBottom: 14, marginLeft: 40 }]}>本文（根拠の箇所をハイライトしています）</Text>
          <PassageReader
            blocks={MOCK_BLOCKS}
            dictionary={MOCK_DICTIONARY}
            glossary={MOCK_GLOSSARY}
            highlight={highlight}
            readAloud={readAloud.state}
            translatedBlocks={translatedBlocks}
            onBlockLayout={(blockIndex, y) => {
              blockY.current[blockIndex] = y
            }}
            onPlayBlock={(blockIndex) => {
              setIsFollowing(true)
              readAloud.playBlock(blockIndex)
            }}
            onToggleTranslation={blockIndex => setTranslatedBlocks((value) => {
              const next = new Set(value)
              if (next.has(blockIndex)) next.delete(blockIndex)
              else next.add(blockIndex)
              return next
            })}
            onWordPress={setWordCard}
          />
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.readAloudWrapper}>
        {isReading && !isFollowing && <ReturnToReadingButton onPress={() => setIsFollowing(true)} />}
        <ReadAloudBar
          blocks={MOCK_BLOCKS}
          isAvailable
          progress={readAloud.progress}
          rate={readAloud.rate}
          state={readAloud.state}
          onRatePress={readAloud.cycleRate}
          onStop={readAloud.stop}
          onToggle={() => {
            setIsFollowing(true)
            readAloud.togglePlay()
          }}
        />
      </View>

      {wordCard && (
        <View style={styles.wordCardWrapper}>
          <WordCard content={wordCard} onClose={() => setWordCard(null)} />
        </View>
      )}

      <SafeAreaView edges={["bottom"]} style={styles.bottomBar}>
        <View style={{ flex: 1 }}><SecondaryButton label="もう一度解く" onPress={() => router.replace("/mock/attempts/42")} /></View>
        <View style={{ flex: 1 }}><PrimaryButton label="次の問題を解く" onPress={() => router.push("/mock/passages/57")} /></View>
      </SafeAreaView>

      <MockStatePanel bottom={156} current={isOvertimeState ? "overtime" : "normal"} states={STATES} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  attribution: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    marginTop: 6,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
  },
  backText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  bottomBar: {
    backgroundColor: "rgba(24, 29, 40, 0.97)",
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    position: "absolute",
    right: 0,
  },
  choice: {
    alignItems: "flex-start",
    borderColor: "transparent",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    padding: 10,
  },
  choiceCorrect: {
    backgroundColor: MOCK_COLORS.correctWash,
    borderColor: "rgba(111, 202, 163, 0.5)",
  },
  choiceLetter: {
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    color: MOCK_COLORS.fgFaint,
    fontFamily: MOCK_FONTS.code,
    fontSize: 11,
    height: 20,
    lineHeight: 18,
    overflow: "hidden",
    textAlign: "center",
    width: 20,
  },
  choiceLetterCorrect: {
    backgroundColor: MOCK_COLORS.correct,
    borderColor: MOCK_COLORS.correct,
    color: MOCK_COLORS.canvas,
  },
  choiceLetterWrong: {
    backgroundColor: MOCK_COLORS.wrong,
    borderColor: MOCK_COLORS.wrong,
    color: MOCK_COLORS.canvas,
  },
  choiceText: {
    color: MOCK_COLORS.fg,
    flex: 1,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 15,
    lineHeight: 21,
  },
  choiceWrong: {
    backgroundColor: MOCK_COLORS.wrongWash,
    borderColor: "rgba(240, 140, 140, 0.5)",
  },
  evidenceButton: {
    alignSelf: "flex-start",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  evidenceButtonActive: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  explanation: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
    lineHeight: 25,
    marginTop: 12,
  },
  faint: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    marginTop: 4,
  },
  lookupHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lookupLink: {
    color: MOCK_COLORS.amber,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  lookupMeaning: {
    color: MOCK_COLORS.fgMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  lookupRow: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
  },
  lookupSurface: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 15,
    width: 104,
  },
  metric: {
    color: MOCK_COLORS.fg,
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  metricSmall: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 18,
  },
  overtimeBadge: {
    borderColor: "rgba(240, 140, 140, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    color: MOCK_COLORS.wrong,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  passage: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingRight: 18,
    paddingTop: 20,
  },
  passageTitle: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 16,
  },
  prompt: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 16,
    lineHeight: 24,
  },
  question: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  questionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  questionNumber: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
    fontWeight: "600",
  },
  readAloudWrapper: {
    bottom: 92,
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 30,
  },
  score: {
    color: MOCK_COLORS.fg,
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  scoreRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  section: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  square: {
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  squareWrong: {
    backgroundColor: MOCK_COLORS.wrongWash,
    borderColor: MOCK_COLORS.wrong,
    borderWidth: 1,
  },
  summary: {
    backgroundColor: MOCK_COLORS.surface,
    padding: 20,
  },
  timeFill: {
    borderRadius: 3,
    height: 6,
  },
  timeLimitMark: {
    backgroundColor: MOCK_COLORS.fgMuted,
    height: 14,
    left: "80%",
    position: "absolute",
    top: -4,
    width: 1,
  },
  timeRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  timeTrack: {
    backgroundColor: MOCK_COLORS.heat0,
    borderRadius: 3,
    height: 6,
    marginTop: 8,
  },
  topBar: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  typeBadge: {
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 4,
    borderWidth: 1,
    color: MOCK_COLORS.fgMuted,
    fontSize: 11,
    paddingHorizontal: 5,
  },
  wordCardWrapper: {
    bottom: 156,
    left: 12,
    position: "absolute",
    right: 12,
  },
})
