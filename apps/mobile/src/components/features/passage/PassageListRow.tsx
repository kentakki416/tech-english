import { Pressable, StyleSheet, Text, View } from "react-native"

import type { PassageListItemResponse } from "@repo/api-schema"

import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { formatSeconds } from "@/libs/format"

import { DifficultyMeter } from "./DifficultyMeter"
import { SourceMeta } from "./SourceMeta"

/**
 * 行の右端の挑戦状況（挑戦中 / 未挑戦 / 最高正答数。判定は web の問題一覧と同じ）
 */
function MyStatus({ passage }: { passage: PassageListItemResponse }) {
  const { attempt_count: attemptCount, best_correct_count: bestCorrectCount, in_progress_attempt_id: inProgressAttemptId } = passage.my_status
  if (inProgressAttemptId !== null) return <Text style={styles.inProgress}>挑戦中</Text>
  if (attemptCount === 0) return <Text style={styles.unattempted}>未挑戦</Text>

  const bestCorrect = bestCorrectCount ?? 0
  return (
    <View style={styles.best}>
      <ScoreSquares results={Array.from({ length: passage.question_count }, (_, index) => index < bestCorrect)} />
      <Text style={styles.metaText}>{bestCorrect}/{passage.question_count}</Text>
    </View>
  )
}

/**
 * 問題一覧の 1 行。タイトル（2 行まで）→ 種別とソース → 難易度・英単語数・制限時間・挑戦状況
 */
export function PassageListRow({ passage, onPress }: { passage: PassageListItemResponse, onPress: (id: number) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(passage.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text numberOfLines={2} style={styles.title}>{passage.title}</Text>
      <View style={styles.source}>
        <SourceMeta name={passage.source.name} />
      </View>
      <View style={styles.meta}>
        <DifficultyMeter level={passage.difficulty} />
        <Text style={styles.metaText}>{passage.word_count} 語</Text>
        <Text style={styles.metaText}>{formatSeconds(passage.time_limit_seconds)}</Text>
        <View style={styles.status}>
          <MyStatus passage={passage} />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  best: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  inProgress: {
    borderColor: "rgba(243, 178, 76, 0.5)",
    borderRadius: 4,
    borderWidth: 1,
    color: THEME_COLORS.amber,
    fontSize: 12,
    paddingHorizontal: 6,
  },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  metaText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
  row: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowPressed: {
    backgroundColor: THEME_COLORS.surface,
  },
  source: {
    marginTop: 6,
  },
  status: {
    marginLeft: "auto",
  },
  title: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 18,
    lineHeight: 24,
  },
  unattempted: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
  },
})
