import { StyleSheet, Text, View } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, type PassageDifficulty } from "./labels"

export function DifficultyMeter({ level }: { level: PassageDifficulty }) {
  return (
    <View accessibilityLabel={`難易度 ${DIFFICULTY_LABELS[level]}`} style={styles.difficulty}>
      <View style={styles.bars}>
        {DIFFICULTY_ORDER.map(step => (
          <View key={step} style={[styles.bar, { backgroundColor: step <= level ? THEME_COLORS.amber : THEME_COLORS.lineStrong, height: 6 + step * 3 }]} />
        ))}
      </View>
      <Text style={styles.label}>{DIFFICULTY_LABELS[level]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 1,
    width: 4,
  },
  bars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
  },
  difficulty: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  label: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
  },
})
