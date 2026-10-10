import { useEffect, useRef } from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"

import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import { DIFFICULTY_LABELS, type MockDifficulty, type MockSourceKind, SOURCE_KIND_LABELS } from "@/libs/mock-data"

/**
 * ロゴ。学習した日を表す「灯ったマス」をブランドの印にする
 */
export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.wordmarkLamp} />
      <Text style={styles.wordmarkText}>tech-english</Text>
    </View>
  )
}

/**
 * 取得元の種別（GitHub / Docs）とソース名
 */
export function SourceMeta({ kind, name }: { kind: MockSourceKind, name: string }) {
  return (
    <View style={styles.sourceMeta}>
      <Text style={[styles.kindBadge, kind === "github" ? styles.kindGithub : styles.kindDocs]}>{SOURCE_KIND_LABELS[kind]}</Text>
      <Text numberOfLines={1} style={styles.sourceName}>{name}</Text>
    </View>
  )
}

/**
 * 難易度。3 本のバーのうち難易度の数だけ灯す
 */
export function DifficultyMeter({ level }: { level: MockDifficulty }) {
  return (
    <View style={styles.difficulty}>
      <View style={styles.difficultyBars}>
        {[1, 2, 3].map(step => (
          <View key={step} style={[styles.difficultyBar, { backgroundColor: step <= level ? MOCK_COLORS.amber : MOCK_COLORS.lineStrong, height: 6 + step * 3 }]} />
        ))}
      </View>
      <Text style={styles.metaText}>{DIFFICULTY_LABELS[level]}</Text>
    </View>
  )
}

function ScoreSquare({ delay, isAnimated, result, size }: { delay: number, isAnimated: boolean, result: boolean | null, size: number }) {
  const progress = useRef(new Animated.Value(isAnimated ? 0 : 1)).current

  useEffect(() => {
    if (!isAnimated) return
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(progress, { friction: 5, tension: 120, toValue: 1, useNativeDriver: true }),
    ]).start()
  }, [delay, isAnimated, progress])

  return (
    <Animated.View
      accessibilityLabel={result === null ? "未挑戦" : result ? "正解" : "不正解"}
      style={{
        backgroundColor: result === null ? MOCK_COLORS.heat0 : result ? MOCK_COLORS.correct : MOCK_COLORS.wrongWash,
        borderColor: result === false ? MOCK_COLORS.wrong : "transparent",
        borderRadius: size > 20 ? 6 : 2,
        borderWidth: result === false ? 1 : 0,
        height: size,
        opacity: progress,
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        width: size,
      }}
    />
  )
}

/**
 * 設問ごとの正誤を並べたマス。結果画面では順に灯す
 */
export function ScoreSquares({ isAnimated = false, results, size = 10 }: { isAnimated?: boolean, results: (boolean | null)[], size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: size > 20 ? 8 : 4 }}>
      {results.map((result, index) => (
        <ScoreSquare key={index} delay={180 + index * 140} isAnimated={isAnimated} result={result} size={size} />
      ))}
    </View>
  )
}

/**
 * 主要ボタン（琥珀）。1 画面に 1 つ
 */
export function PrimaryButton({ label, onPress }: { label: string, onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && { backgroundColor: MOCK_COLORS.amberBright }]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

/**
 * 副ボタン（枠だけ）
 */
export function SecondaryButton({ label, onPress }: { label: string, onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && { backgroundColor: MOCK_COLORS.raised }]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  )
}

/**
 * セグメント（選択中だけ raised の塗り）
 */
export function Segment<T extends string>({ onChange, options, value }: { onChange: (value: T) => void, options: { key: T, label: string }[], value: T }) {
  return (
    <View style={styles.segment}>
      {options.map(option => (
        <Pressable
          key={option.key}
          accessibilityRole="button"
          accessibilityState={{ selected: option.key === value }}
          onPress={() => onChange(option.key)}
          style={[styles.segmentItem, option.key === value && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, option.key === value && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

/**
 * チップ（選択中は琥珀の枠と淡い琥珀）
 */
export function Chip({ isActive, label, onPress }: { isActive: boolean, label: string, onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: isActive }} onPress={onPress} style={[styles.chip, isActive && styles.chipActive]}>
      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

export const mockStyles = StyleSheet.create({
  card: {
    backgroundColor: MOCK_COLORS.surface,
    borderColor: MOCK_COLORS.line,
    borderRadius: 12,
    borderWidth: 1,
  },
  caption: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  divider: {
    backgroundColor: MOCK_COLORS.line,
    height: StyleSheet.hairlineWidth,
  },
  screen: {
    backgroundColor: MOCK_COLORS.canvas,
    flex: 1,
  },
  sectionTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
})

const styles = StyleSheet.create({
  chip: {
    borderColor: MOCK_COLORS.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  chipText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
  },
  chipTextActive: {
    color: MOCK_COLORS.amber,
  },
  difficulty: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  difficultyBar: {
    borderRadius: 1,
    width: 4,
  },
  difficultyBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
  },
  kindBadge: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "500",
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kindDocs: {
    borderColor: "rgba(243, 178, 76, 0.4)",
    color: MOCK_COLORS.amber,
  },
  kindGithub: {
    borderColor: MOCK_COLORS.lineStrong,
    color: MOCK_COLORS.fg,
  },
  metaText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 10,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: MOCK_COLORS.amberInk,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
  },
  segment: {
    borderColor: MOCK_COLORS.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 2,
  },
  segmentItem: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  segmentItemActive: {
    backgroundColor: MOCK_COLORS.raised,
  },
  segmentText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
  },
  segmentTextActive: {
    color: MOCK_COLORS.fg,
  },
  sourceMeta: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
  },
  sourceName: {
    color: MOCK_COLORS.fgMuted,
    flexShrink: 1,
    fontSize: 13,
  },
  wordmark: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  wordmarkLamp: {
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 3,
    height: 12,
    shadowColor: MOCK_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    width: 12,
  },
  wordmarkText: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.codeMedium,
    fontSize: 15,
  },
})
