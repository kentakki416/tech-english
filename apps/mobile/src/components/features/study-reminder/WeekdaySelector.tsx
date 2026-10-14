import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 月曜始まり（ISO の曜日番号の順）
 */
const WEEKDAYS = [
  { label: "月", value: 1 },
  { label: "火", value: 2 },
  { label: "水", value: 3 },
  { label: "木", value: 4 },
  { label: "金", value: 5 },
  { label: "土", value: 6 },
  { label: "日", value: 7 },
] as const

/**
 * 曜日の丸いボタン。選択中は琥珀の塗り。外せるかどうか（最後の 1 つ）は親が決める
 */
export function WeekdaySelector({ weekdays, onToggle }: { weekdays: number[], onToggle: (isoWeekday: number) => void }) {
  return (
    <View style={styles.weekdays}>
      {WEEKDAYS.map(day => {
        const isActive = weekdays.includes(day.value)
        return (
          <Pressable
            key={day.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={[styles.weekday, isActive && styles.weekdayActive]}
            onPress={() => onToggle(day.value)}
          >
            <Text style={[styles.weekdayText, isActive && styles.weekdayTextActive]}>{day.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  weekday: {
    alignItems: "center",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 20,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  weekdayActive: {
    backgroundColor: THEME_COLORS.amber,
    borderColor: THEME_COLORS.amber,
  },
  weekdayText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  weekdayTextActive: {
    color: THEME_COLORS.amberInk,
  },
  weekdays: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
})
