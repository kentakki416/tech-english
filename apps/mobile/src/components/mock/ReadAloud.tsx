import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AppState, Pressable, StyleSheet, Text, View } from "react-native"

import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import type { MockGlossaryEntry, MockPassageBlock } from "@/libs/mock-data"

import { segmentText } from "./passage-text"

export type ReadAloudRate = 0.75 | 1 | 1.25

export type ReadAloudState = {
  blockIndex: number | null
  isPlaying: boolean
  mode: "all" | "block"
  wordIndex: number
}

const READ_ALOUD_RATES: ReadAloudRate[] = [0.75, 1, 1.25]

/**
 * 1 倍速で 1 分あたりに読む語数（モックの擬似再生用）
 */
const WORDS_PER_MINUTE = 150

/**
 * この語数を読み進めたら「聞いた段落」に数える（本実装は 1 秒以上の再生）
 */
const LISTENED_WORD_THRESHOLD = 3

const IDLE_STATE: ReadAloudState = { blockIndex: null, isPlaying: false, mode: "all", wordIndex: 0 }

/**
 * 読み上げの擬似再生（モック用）。本実装は expo-audio の再生位置と単語の時刻から今の単語を求める
 */
export function useReadAloudMock({
  blocks,
  glossary,
  initialState = IDLE_STATE,
}: {
  blocks: MockPassageBlock[]
  glossary: MockGlossaryEntry[]
  initialState?: ReadAloudState
}) {
  const [state, setState] = useState<ReadAloudState>(initialState)
  const [rate, setRate] = useState<ReadAloudRate>(1)
  const [listenedBlocks, setListenedBlocks] = useState<Set<number>>(
    initialState.blockIndex !== null && initialState.wordIndex >= LISTENED_WORD_THRESHOLD ? new Set([initialState.blockIndex]) : new Set(),
  )

  const wordCounts = useMemo(
    () => blocks.map(block => (block.type === "code" ? 0 : segmentText(block.text, glossary).filter(segment => segment.kind === "word").length)),
    [blocks, glossary],
  )
  const readableIndexes = useMemo(() => wordCounts.flatMap((count, index) => (count > 0 ? [index] : [])), [wordCounts])
  const totalWords = useMemo(() => wordCounts.reduce((sum, count) => sum + count, 0), [wordCounts])

  useEffect(() => {
    if (!state.isPlaying || state.blockIndex === null) return
    const blockIndex = state.blockIndex
    const timer = setTimeout(() => {
      const nextBlockIndex = readableIndexes.find(index => index > blockIndex)
      const next: ReadAloudState =
        state.wordIndex + 1 < wordCounts[blockIndex]
          ? { ...state, wordIndex: state.wordIndex + 1 }
          : state.mode === "block" || nextBlockIndex === undefined
            ? IDLE_STATE
            : { ...state, blockIndex: nextBlockIndex, wordIndex: 0 }
      setState(next)
      if (next.blockIndex !== null && next.wordIndex >= LISTENED_WORD_THRESHOLD) {
        const listened = next.blockIndex
        setListenedBlocks(current => (current.has(listened) ? current : new Set(current).add(listened)))
      }
    }, 60_000 / (WORDS_PER_MINUTE * rate))
    return () => clearTimeout(timer)
  }, [rate, readableIndexes, state, wordCounts])

  /**
   * アプリが背面に回ったら止める（タイマーが止まるのと合わせる）
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") setState(current => ({ ...current, isPlaying: false }))
    })
    return () => subscription.remove()
  }, [])

  const playBlock = useCallback((blockIndex: number) => {
    setState(current =>
      current.blockIndex === blockIndex && current.mode === "block"
        ? { ...current, isPlaying: !current.isPlaying }
        : { blockIndex, isPlaying: true, mode: "block", wordIndex: 0 },
    )
  }, [])

  const togglePlay = useCallback(() => {
    setState(current => (current.blockIndex === null ? { blockIndex: readableIndexes[0] ?? null, isPlaying: true, mode: "all", wordIndex: 0 } : { ...current, isPlaying: !current.isPlaying }))
  }, [readableIndexes])

  const cycleRate = useCallback(() => {
    setRate(current => READ_ALOUD_RATES[(READ_ALOUD_RATES.indexOf(current) + 1) % READ_ALOUD_RATES.length])
  }, [])

  const pause = useCallback(() => setState(current => ({ ...current, isPlaying: false })), [])
  const stop = useCallback(() => setState(IDLE_STATE), [])

  const wordsBefore = state.blockIndex === null ? 0 : wordCounts.slice(0, state.blockIndex).reduce((sum, count) => sum + count, 0)
  const progress =
    state.blockIndex === null
      ? 0
      : state.mode === "block"
        ? (state.wordIndex + 1) / wordCounts[state.blockIndex]
        : (wordsBefore + state.wordIndex + 1) / totalWords

  return { cycleRate, listenedBlocks, pause, playBlock, progress, rate, state, stop, togglePlay }
}

/**
 * 本文の下端（設問シートのすぐ上）に浮かべる読み上げのミニプレーヤー
 */
export function ReadAloudBar({
  blocks,
  isAvailable,
  progress,
  rate,
  state,
  onRatePress,
  onStop,
  onToggle,
}: {
  blocks: MockPassageBlock[]
  isAvailable: boolean
  progress: number
  rate: ReadAloudRate
  state: ReadAloudState
  onRatePress: () => void
  onStop: () => void
  onToggle: () => void
}) {
  const isActive = state.blockIndex !== null
  const paragraphNumbers = useMemo(() => {
    let count = 0
    return blocks.map(block => (block.type === "code" || block.type === "heading" ? null : ++count))
  }, [blocks])
  const paragraphCount = paragraphNumbers.filter(number => number !== null).length
  const currentNumber = state.blockIndex === null ? null : paragraphNumbers[state.blockIndex]

  if (!isAvailable) {
    return (
      <View style={[styles.bar, styles.barPending]}>
        <View style={[styles.playButton, styles.playButtonDisabled]}>
          <Ionicons color={MOCK_COLORS.fgFaint} name="play" size={14} />
        </View>
        <Text style={styles.pendingText}>読み上げの音声を準備中です</Text>
      </View>
    )
  }

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityLabel={state.isPlaying ? "読み上げを一時停止" : isActive ? "読み上げを再開" : "全文を読み上げ"}
        onPress={onToggle}
        style={({ pressed }) => [styles.playButton, pressed && { backgroundColor: MOCK_COLORS.amberBright }]}
      >
        <Ionicons color={MOCK_COLORS.amberInk} name={state.isPlaying ? "pause" : "play"} size={14} style={state.isPlaying ? undefined : { marginLeft: 2 }} />
      </Pressable>
      <View>
        <Text style={styles.label}>{!isActive ? "全文を読み上げ" : currentNumber === null ? "見出し" : `段落 ${currentNumber} / ${paragraphCount}`}</Text>
        {isActive && <Text style={styles.subLabel}>{state.mode === "all" ? "全文" : "この段落だけ"}</Text>}
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      {isActive && (
        <Pressable accessibilityLabel="読み上げを停止" hitSlop={6} onPress={onStop} style={styles.iconButton}>
          <Ionicons color={MOCK_COLORS.fgMuted} name="stop" size={13} />
        </Pressable>
      )}
      <Pressable accessibilityLabel={`再生速度 ${rate} 倍。押すと切り替え`} hitSlop={6} onPress={onRatePress} style={styles.rateButton}>
        <Text style={styles.rateText}>{rate}x</Text>
      </Pressable>
    </View>
  )
}

/**
 * 自動スクロールを止めた後に出す「読み上げ中の位置に戻る」
 */
export function ReturnToReadingButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.returnButton}>
      <Ionicons color={MOCK_COLORS.amber} name="arrow-down" size={13} />
      <Text style={styles.returnText}>読み上げ中の位置に戻る</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: "rgba(32, 39, 54, 0.97)",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 52,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  barPending: {
    borderColor: MOCK_COLORS.line,
    paddingRight: 14,
  },
  iconButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 28,
  },
  label: {
    color: MOCK_COLORS.fg,
    fontSize: 13,
  },
  pendingText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
  playButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  playButtonDisabled: {
    backgroundColor: MOCK_COLORS.line,
  },
  rateButton: {
    alignItems: "center",
    borderColor: MOCK_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 6,
  },
  rateText: {
    color: MOCK_COLORS.fgMuted,
    fontFamily: MOCK_FONTS.code,
    fontSize: 12,
  },
  returnButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(32, 39, 54, 0.97)",
    borderColor: "rgba(243, 178, 76, 0.4)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  returnText: {
    color: MOCK_COLORS.amber,
    fontSize: 12,
  },
  subLabel: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
  },
  track: {
    backgroundColor: MOCK_COLORS.line,
    borderRadius: 2,
    flex: 1,
    height: 4,
    overflow: "hidden",
  },
  trackFill: {
    backgroundColor: "rgba(243, 178, 76, 0.85)",
    height: "100%",
  },
})
