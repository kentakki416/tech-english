import { StyleSheet, Text, View } from "react-native"

import type { GetUserStatsResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * 連続学習日数のパネル。直近 14 日のマスは学習した日を琥珀にし、末尾（今日）は学習していれば光らせる
 */
export function StreakPanel({ isEmpty, streak }: { isEmpty: boolean, streak: GetUserStatsResponse["streak"] }) {
  const lastIndex = streak.recent_days.length - 1

  return (
    <View style={styles.section}>
      <Text style={appStyles.caption}>連続学習日数</Text>
      {isEmpty ? (
        <Text style={styles.faintText}>まだ記録がありません。</Text>
      ) : (
        <>
          <View style={styles.streakRow}>
            <Text style={styles.streakNumber}>{streak.current}</Text>
            <Text style={appStyles.caption}>日</Text>
            <Text style={[styles.faintText, styles.longest]}>最長 {streak.longest} 日</Text>
          </View>
          <View accessibilityLabel="直近 14 日の学習" accessibilityRole="image" style={styles.lamps}>
            {streak.recent_days.map((day, index) => (
              <View
                key={day.date}
                style={[styles.lamp, day.has_studied ? styles.lampOn : styles.lampOff, index === lastIndex && day.has_studied && styles.lampToday]}
              />
            ))}
          </View>
          <Text style={styles.faintText}>直近 14 日</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  faintText: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 8,
  },
  lamp: {
    borderRadius: 3,
    flex: 1,
    height: 20,
  },
  lampOff: {
    borderColor: THEME_COLORS.lineStrong,
    borderWidth: 1,
  },
  lampOn: {
    backgroundColor: THEME_COLORS.amber,
  },
  lampToday: {
    shadowColor: THEME_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  lamps: {
    flexDirection: "row",
    gap: 4,
    marginTop: 12,
  },
  longest: {
    marginLeft: "auto",
    marginTop: 0,
  },
  section: {
    padding: 16,
  },
  streakNumber: {
    color: THEME_COLORS.fg,
    fontSize: 30,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  streakRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
})
