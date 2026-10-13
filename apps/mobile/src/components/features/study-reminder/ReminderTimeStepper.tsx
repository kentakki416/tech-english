import { Ionicons } from "@expo/vector-icons"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

/**
 * 時刻を動かす幅（API は 15 分刻みだけを受け付ける）
 */
const TIME_STEP_MINUTES = 15

/**
 * 時刻の「−」「＋」。値は等幅数字 26px
 */
export function ReminderTimeStepper({ time, onShift }: { time: string, onShift: (minutes: number) => void }) {
  return (
    <View style={styles.timeRow}>
      <Pressable
        accessibilityLabel="15 分早める"
        accessibilityRole="button"
        style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}
        onPress={() => onShift(-TIME_STEP_MINUTES)}
      >
        <Ionicons color={THEME_COLORS.fg} name="remove" size={18} />
      </Pressable>
      <Text style={styles.timeValue}>{time}</Text>
      <Pressable
        accessibilityLabel="15 分遅らせる"
        accessibilityRole="button"
        style={({ pressed }) => [styles.timeButton, pressed && styles.timeButtonPressed]}
        onPress={() => onShift(TIME_STEP_MINUTES)}
      >
        <Ionicons color={THEME_COLORS.fg} name="add" size={18} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  timeButton: {
    alignItems: "center",
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 44,
  },
  timeButtonPressed: {
    backgroundColor: THEME_COLORS.raised,
  },
  timeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginBottom: 6,
    marginTop: 8,
  },
  timeValue: {
    color: THEME_COLORS.fg,
    fontSize: 26,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    minWidth: 86,
    textAlign: "center",
  },
})
