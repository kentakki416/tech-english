import { Pressable, StyleSheet, Text } from "react-native"

import { THEME_COLORS } from "@/const/design-theme"

export function Chip({ isActive, label, onPress }: { isActive: boolean, label: string, onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={[styles.chip, isActive && styles.chipActive]}
    >
      <Text style={[styles.text, isActive && styles.textActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderColor: THEME_COLORS.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.6)",
  },
  text: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
  },
  textActive: {
    color: THEME_COLORS.amber,
  },
})
