import { StyleSheet, Text, View } from "react-native"

import type { GetUserStatsResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"
import { formatStudyTime } from "@/libs/format"

/**
 * 正答率の表示。設問が 0 問（null）なら `—`
 */
const formatAccuracy = (accuracyPercent: number | null): string => (accuracyPercent === null ? "—" : `${accuracyPercent}%`)

/**
 * 累計（解いた問題・挑戦した回数・学習時間・正答率）と、アシストなしの正答率
 */
export function StudyTotals({
  noAssist,
  totals,
}: {
  noAssist: GetUserStatsResponse["no_assist"]
  totals: GetUserStatsResponse["totals"]
}) {
  const items = [
    { label: "解いた問題", value: String(totals.passage_count) },
    { label: "挑戦した回数", value: String(totals.attempt_count) },
    { label: "学習時間", value: formatStudyTime(totals.study_seconds) },
    { label: "正答率", value: formatAccuracy(totals.accuracy_percent) },
  ]

  return (
    <View>
      <Text accessibilityRole="header" style={appStyles.sectionTitle}>累計</Text>
      <View style={styles.stats}>
        {items.map(item => (
          <View key={item.label} style={styles.stat}>
            <Text style={appStyles.caption}>{item.label}</Text>
            <Text style={styles.statValue}>{item.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.faintText}>アシストなしの正答率は {formatAccuracy(noAssist.accuracy_percent)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  faintText: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 8,
  },
  stat: {
    width: "50%",
  },
  statValue: {
    color: THEME_COLORS.fg,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    rowGap: 16,
  },
})
