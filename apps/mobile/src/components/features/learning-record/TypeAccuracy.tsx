import { StyleSheet, Text, View } from "react-native"

import type { GetUserStatsResponse } from "@repo/api-schema"

import { QUESTION_TYPE_LABELS } from "@/components/features/passage/labels"
import { appStyles } from "@/components/ui/app-styles"
import { THEME_COLORS } from "@/const/design-theme"

/**
 * この正答率未満の種類は淡い琥珀にする（苦手の目安。web と同じ）
 */
const WEAK_ACCURACY_PERCENT = 70

/**
 * 設問の種類別の正答率。設問の無い種類（null）は `—` と空の棒。一番低い種類を下に書く
 */
export function TypeAccuracy({
  typeAccuracy,
  weakestQuestionType,
}: {
  typeAccuracy: GetUserStatsResponse["type_accuracy"]
  weakestQuestionType: GetUserStatsResponse["weakest_question_type"]
}) {
  return (
    <View>
      <Text accessibilityRole="header" style={appStyles.sectionTitle}>設問の種類別の正答率</Text>
      {typeAccuracy.map(item => (
        <View key={item.type} style={styles.row}>
          <Text style={styles.label}>{QUESTION_TYPE_LABELS[item.type]}</Text>
          <View style={styles.track}>
            {item.accuracy_percent !== null && (
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: item.accuracy_percent < WEAK_ACCURACY_PERCENT ? "rgba(243, 178, 76, 0.5)" : THEME_COLORS.amber,
                    width: `${item.accuracy_percent}%`,
                  },
                ]}
              />
            )}
          </View>
          <Text style={styles.value}>{item.accuracy_percent === null ? "—" : `${item.accuracy_percent}%`}</Text>
        </View>
      ))}
      {weakestQuestionType !== null && (
        <Text style={styles.faintText}>{QUESTION_TYPE_LABELS[weakestQuestionType]}の設問が一番苦手です。</Text>
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
  fill: {
    borderRadius: 4,
    height: 8,
  },
  label: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    width: 36,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  track: {
    backgroundColor: THEME_COLORS.heat0,
    borderRadius: 4,
    flex: 1,
    height: 8,
  },
  value: {
    color: THEME_COLORS.fg,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    width: 40,
  },
})
