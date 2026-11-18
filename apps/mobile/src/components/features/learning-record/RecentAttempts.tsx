import { Pressable, StyleSheet, Text, View } from "react-native"

import type { LearningRecordAttemptResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { formatSeconds } from "@/libs/format"

export function RecentAttempts({
  attempts,
  onPressAttempt,
  onShowAll,
}: {
  attempts: LearningRecordAttemptResponse[]
  onPressAttempt: (id: number) => void
  onShowAll: () => void
}) {
  return (
    <View style={styles.section}>
      <View style={styles.rowBetween}>
        <Text style={appStyles.caption}>最近の挑戦</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onShowAll}>
          <Text style={appStyles.caption}>すべて見る</Text>
        </Pressable>
      </View>
      {attempts.map(attempt => (
        <Pressable
          key={attempt.id}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onPressAttempt(attempt.id)}
        >
          <Text numberOfLines={1} style={styles.title}>{attempt.title}</Text>
          <View style={styles.meta}>
            <ScoreSquares results={Array.from({ length: attempt.question_count }, (_, index) => index < attempt.correct_count)} />
            <Text style={appStyles.caption}>{attempt.correct_count} / {attempt.question_count}</Text>
            <Text style={[appStyles.caption, styles.elapsed]}>{formatSeconds(attempt.elapsed_seconds)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  elapsed: {
    marginLeft: "auto",
  },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  row: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
  },
  rowBetween: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowPressed: {
    opacity: 0.7,
  },
  section: {
    padding: 16,
  },
  title: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 15,
  },
})
